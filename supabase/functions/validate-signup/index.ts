import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateSignupRequest {
  standNumber: string;
  phoneNumber: string;
}

// Rate limiting: max 5 validation attempts per phone per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const validationAttempts = new Map<string, { count: number; firstAttempt: number }>();

// Helper functions for JWT signing
const base64url = (str: string) => {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const extractPemBase64 = (pem: string) => {
  const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
  const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
  const body = match ? match[1] : normalized;
  let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  else if (pad === 1) throw new Error('Invalid base64 length');
  return base64;
};

// Clean up old rate limit entries periodically
const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [key, value] of validationAttempts.entries()) {
    if (now - value.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      validationAttempts.delete(key);
    }
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { standNumber, phoneNumber }: ValidateSignupRequest = await req.json();

    // Input validation
    if (!standNumber || typeof standNumber !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: "Stand number is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: "Phone number is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const trimmedStand = standNumber.trim();
    const trimmedPhone = phoneNumber.trim();

    if (trimmedStand.length === 0 || trimmedStand.length > 50) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid stand number format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate phone number format
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid phone number format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting check
    cleanupRateLimits();
    const rateLimitKey = trimmedPhone;
    const attemptRecord = validationAttempts.get(rateLimitKey);
    
    if (attemptRecord) {
      if (Date.now() - attemptRecord.firstAttempt < RATE_LIMIT_WINDOW_MS) {
        if (attemptRecord.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          console.log(`Rate limit exceeded for phone: ${trimmedPhone}`);
          return new Response(
            JSON.stringify({ valid: false, error: "Too many attempts. Please try again later." }),
            { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        attemptRecord.count++;
      } else {
        validationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
      }
    } else {
      validationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
    }

    console.log(`Validating signup for stand: ${trimmedStand}, phone: ${trimmedPhone}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if an account already exists for this stand number
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, stand_number')
      .eq('stand_number', trimmedStand)
      .maybeSingle();

    if (existingProfile) {
      console.log(`Account already exists for stand number: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "An account already exists for this stand number. Please login instead.",
          existingAccount: true
        }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Look up stand number and phone in Google Sheets
    console.log(`Looking up stand number in Google Sheets: ${trimmedStand}`);

    const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
    const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
    
    let privateKeyPem: string;
    let serviceAccountEmail: string;
    
    try {
      const credentials = JSON.parse(keyString.replace(/\\n/g, '\n'));
      privateKeyPem = credentials.private_key;
      serviceAccountEmail = credentials.client_email;
    } catch {
      privateKeyPem = keyString;
      serviceAccountEmail = clientEmail;
    }

    if (!serviceAccountEmail) {
      console.error('Google service account not configured');
      return new Response(
        JSON.stringify({ valid: false, error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create JWT for Google Sheets API
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const jwtHeader = base64url(JSON.stringify(header));
    const jwtClaimSet = base64url(JSON.stringify(claimSet));
    const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

    const base64Key = extractPemBase64(privateKeyPem);
    const raw = atob(base64Key);
    const buffer = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(signatureInput)
    );

    const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Failed to get Google access token');
      return new Response(
        JSON.stringify({ valid: false, error: "Failed to verify credentials" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { access_token } = await tokenResponse.json();

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ valid: false, error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch spreadsheet data
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!metadataResponse.ok) {
      console.error('Failed to fetch spreadsheet metadata');
      return new Response(
        JSON.stringify({ valid: false, error: "Failed to verify credentials" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];
    const sheetTitle = sheets.length > 0 ? sheets[0].properties.title : 'Sheet1';

    const range = encodeURIComponent(`${sheetTitle}!A:AZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!response.ok) {
      console.error('Failed to fetch spreadsheet data');
      return new Response(
        JSON.stringify({ valid: false, error: "Failed to verify credentials" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ valid: false, error: "Stand number not found in our records" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find column indices
    const headers = rows[0];
    const standNumIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('stand'));
    const phoneIndex = headers.findIndex((h: string) => {
      const header = h?.toString().toLowerCase().trim() || '';
      return header.includes('phone') || header.includes('contact');
    });
    const emailIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('email'));

    if (standNumIndex === -1) {
      console.error('Could not find stand number column in spreadsheet');
      return new Response(
        JSON.stringify({ valid: false, error: "Data source configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the row with matching stand number (case-insensitive)
    const customerRow = rows.slice(1).find((row: string[]) => 
      row[standNumIndex] && row[standNumIndex].toString().trim().toLowerCase() === trimmedStand.toLowerCase()
    );

    if (!customerRow) {
      console.log(`Stand number not found: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Stand number not found in our records. Please contact support." 
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check phone column if it exists (optional validation)
    // IMPORTANT: Store the authoritative sheet phone number to return later
    let authoritativePhoneNumber = trimmedPhone; // Default to user input if no sheet phone
    
    if (phoneIndex !== -1) {
      // Normalize phone numbers for comparison
      const normalizePhone = (phone: string): string => {
        return phone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '+263');
      };

      const sheetPhone = customerRow[phoneIndex]?.toString().trim() || '';
      
      if (sheetPhone) {
        const normalizedSheetPhone = normalizePhone(sheetPhone);
        const normalizedInputPhone = normalizePhone(trimmedPhone);

        // Check if phone numbers match (allowing for some flexibility in input)
        const phonesMatch = normalizedSheetPhone.endsWith(normalizedInputPhone.slice(-9)) || 
                           normalizedInputPhone.endsWith(normalizedSheetPhone.slice(-9)) ||
                           normalizedSheetPhone === normalizedInputPhone;

        if (!phonesMatch) {
          console.log(`Phone mismatch for stand ${trimmedStand}: sheet=${normalizedSheetPhone}, input=${normalizedInputPhone}`);
          return new Response(
            JSON.stringify({ 
              valid: false, 
              error: "The phone number does not match our records for this stand number. Please check and try again." 
            }),
            { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        
        // CRITICAL FIX: Use the authoritative sheet phone number, not user input
        // This prevents storing incorrectly formatted phone numbers in the profile
        authoritativePhoneNumber = normalizedSheetPhone;
        console.log(`Using authoritative sheet phone: ${authoritativePhoneNumber} (user entered: ${trimmedPhone})`);
      }
    } else {
      console.log('Phone column not found in spreadsheet - skipping phone validation');
    }

    // Get email if available (optional)
    const email = emailIndex !== -1 ? customerRow[emailIndex]?.toString().trim() : null;

    console.log(`Validation successful for stand: ${trimmedStand}, authoritative phone: ${authoritativePhoneNumber}`);

    return new Response(
      JSON.stringify({ 
        valid: true,
        standNumber: trimmedStand,
        phoneNumber: authoritativePhoneNumber, // Return the authoritative sheet phone, not user input
        email: email || null, // Pass email for account creation if available
        message: "Stand number and phone number verified successfully"
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in validate-signup function:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
