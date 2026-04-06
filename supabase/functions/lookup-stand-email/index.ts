import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LookupRequest {
  standNumber: string;
}

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { standNumber }: LookupRequest = await req.json();

    if (!standNumber || typeof standNumber !== 'string') {
      return new Response(
        JSON.stringify({ error: "Stand number is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const trimmedStand = standNumber.trim();
    if (trimmedStand.length === 0 || trimmedStand.length > 50) {
      return new Response(
        JSON.stringify({ error: "Invalid stand number format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Looking up email for stand number: ${trimmedStand}`);

    // First, check the profiles table for existing user with this stand_number
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Extract tenant_id from JWT app_metadata
    const authHeader = req.headers.get('Authorization');
    let tenantId: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const userToken = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
      tenantId = user?.app_metadata?.tenant_id;
    }

    let profileQuery = supabaseAdmin
      .from('profiles')
      .select('email, phone_number, phone_number_2')
      .eq('stand_number', trimmedStand);
    if (tenantId) profileQuery = profileQuery.eq('tenant_id', tenantId);
    const { data: profile } = await profileQuery.maybeSingle();

    // If found in profiles, return it
    if (profile?.email) {
      console.log(`Found account in profiles for stand number: ${trimmedStand}`);
      
      // Build array of available phone numbers
      const phoneNumbers: string[] = [];
      if (profile.phone_number) phoneNumbers.push(profile.phone_number);
      if (profile.phone_number_2) phoneNumbers.push(profile.phone_number_2);
      
      return new Response(
        JSON.stringify({ 
          found: true,
          email: profile.email,
          hasPhone: phoneNumbers.length > 0,
          phoneNumbers: phoneNumbers,
          phoneNumber: profile.phone_number || null,
          phoneNumber2: profile.phone_number_2 || null,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Otherwise, look up from Google Sheets (source of truth)
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
        JSON.stringify({ error: "Server configuration error" }),
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

    // Get access token
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
        JSON.stringify({ error: "Failed to access data source" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { access_token } = await tokenResponse.json();

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
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
        JSON.stringify({ error: "Failed to access data source" }),
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
        JSON.stringify({ error: "Failed to access data source" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ found: false, error: "No account found for this stand number" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find column indices
    const headers = rows[0];
    const standNumIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('stand'));
    const emailIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('email'));

    if (standNumIndex === -1 || emailIndex === -1) {
      console.error('Could not find required columns in spreadsheet');
      return new Response(
        JSON.stringify({ error: "Data source configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the row with matching stand number (case-insensitive)
    const customerRow = rows.slice(1).find((row: string[]) => 
      row[standNumIndex] && row[standNumIndex].toString().trim().toLowerCase() === trimmedStand.toLowerCase()
    );

    if (!customerRow || !customerRow[emailIndex]) {
      console.log(`No account found in Google Sheets for stand number: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ 
          found: false, 
          error: "No account found for this stand number" 
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const email = customerRow[emailIndex].toString().trim();
    console.log(`Found email in Google Sheets for stand number ${trimmedStand}: ${email}`);

    // Check if user exists in auth by looking up their profile by email
    let existingProfileQuery = supabaseAdmin
      .from('profiles')
      .select('phone_number, phone_number_2')
      .eq('email', email);
    if (tenantId) existingProfileQuery = existingProfileQuery.eq('tenant_id', tenantId);
    const { data: existingProfile } = await existingProfileQuery.maybeSingle();

    // Build array of available phone numbers
    const phoneNumbers: string[] = [];
    if (existingProfile?.phone_number) phoneNumbers.push(existingProfile.phone_number);
    if (existingProfile?.phone_number_2) phoneNumbers.push(existingProfile.phone_number_2);

    return new Response(
      JSON.stringify({ 
        found: true,
        email: email,
        standNumber: trimmedStand, // Return the stand number for syncing to profile
        hasPhone: phoneNumbers.length > 0,
        phoneNumbers: phoneNumbers,
        phoneNumber: existingProfile?.phone_number || null,
        phoneNumber2: existingProfile?.phone_number_2 || null,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in lookup-stand-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
