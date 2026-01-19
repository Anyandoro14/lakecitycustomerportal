import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyOtpRequest {
  phoneNumber: string;
  code: string;
  email: string;
  password: string;
  standNumber?: string;
}

// Rate limiting for OTP verification attempts
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const verificationAttempts = new Map<string, { count: number; firstAttempt: number }>();

const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [key, value] of verificationAttempts.entries()) {
    if (now - value.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      verificationAttempts.delete(key);
    }
  }
};

// Helper: Get Google Sheets access token
async function getGoogleAccessToken(): Promise<string> {
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

  if (!serviceAccountEmail || !privateKeyPem) {
    throw new Error('Google service account not configured');
  }

  const base64url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

  // Extract PEM base64
  const normalized = (privateKeyPem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
  const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
  const body = match ? match[1] : normalized;
  let base64Key = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
  const pad = base64Key.length % 4;
  if (pad === 2) base64Key += '==';
  else if (pad === 3) base64Key += '=';

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
    throw new Error('Failed to get Google access token');
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

// Helper: Sync email to Collection Schedule if conditions match
async function syncEmailToSheet(
  standNumber: string, 
  phoneNumber: string, 
  email: string
): Promise<{ synced: boolean; customerName?: string; customerCategory?: string }> {
  try {
    console.log(`Checking if email sync conditions are met for stand ${standNumber}`);
    
    const accessToken = await getGoogleAccessToken();
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    
    if (!spreadsheetId) {
      console.log('Spreadsheet ID not configured, skipping sync');
      return { synced: false };
    }

    // Fetch spreadsheet metadata
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metadataResponse.ok) {
      console.error('Failed to fetch spreadsheet metadata');
      return { synced: false };
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];
    const sheetTitle = sheets.length > 0 ? sheets[0].properties.title : 'Sheet1';

    // Fetch data
    const range = encodeURIComponent(`${sheetTitle}!A:G`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error('Failed to fetch spreadsheet data');
      return { synced: false };
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      return { synced: false };
    }

    // Column indices (0-based)
    const STAND_COL = 1;  // Column B - Stand Number
    const FIRST_NAME_COL = 2; // Column C - First Name
    const LAST_NAME_COL = 3;  // Column D - Last Name
    const EMAIL_COL = 4;  // Column E - Email
    const CATEGORY_COL = 5; // Column F - Customer Category
    const PHONE_COL = 6;  // Column G - Contact Number

    // Normalize phone number for comparison
    const normalizePhone = (phone: string) => {
      return phone.replace(/\s+/g, '').replace(/^0/, '+263');
    };

    const normalizedInputPhone = normalizePhone(phoneNumber);

    // Find matching row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowStand = row[STAND_COL]?.toString().trim().toUpperCase() || '';
      const rowPhone = row[PHONE_COL]?.toString().trim() || '';
      const rowEmail = row[EMAIL_COL]?.toString().trim() || '';
      const firstName = row[FIRST_NAME_COL]?.toString().trim() || '';
      const lastName = row[LAST_NAME_COL]?.toString().trim() || '';
      const category = row[CATEGORY_COL]?.toString().trim() || '';

      const normalizedRowPhone = normalizePhone(rowPhone);

      // Check if stand number matches
      if (rowStand !== standNumber.trim().toUpperCase()) {
        continue;
      }

      // Check if phone number matches
      if (normalizedRowPhone !== normalizedInputPhone && 
          rowPhone.replace(/\s+/g, '') !== phoneNumber.replace(/\s+/g, '')) {
        console.log(`Phone mismatch for stand ${standNumber}: sheet=${rowPhone}, input=${phoneNumber}`);
        return { 
          synced: false, 
          customerName: `${firstName} ${lastName}`.trim(),
          customerCategory: category
        };
      }

      // All conditions met - sync email only if not already populated
      if (rowEmail && !rowEmail.includes('@lakecity.portal')) {
        console.log(`Email already exists in sheet for stand ${standNumber}: ${rowEmail}`);
        return { 
          synced: false, 
          customerName: `${firstName} ${lastName}`.trim(),
          customerCategory: category
        };
      }

      // Update email in Column E (row i+1 because sheets are 1-indexed)
      const cellRange = `${sheetTitle}!E${i + 1}`;
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;
      
      const updateResponse = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [[email]]
        })
      });

      if (updateResponse.ok) {
        console.log(`Successfully synced email ${email} for stand ${standNumber}`);
        return { 
          synced: true, 
          customerName: `${firstName} ${lastName}`.trim(),
          customerCategory: category
        };
      } else {
        console.error('Failed to update email in sheet:', await updateResponse.text());
        return { 
          synced: false, 
          customerName: `${firstName} ${lastName}`.trim(),
          customerCategory: category
        };
      }
    }

    console.log(`No matching row found for stand ${standNumber}`);
    return { synced: false };
  } catch (error) {
    console.error('Error during email sync:', error);
    return { synced: false };
  }
}

// Helper: Send activation notification
async function sendActivationNotification(
  customerName: string,
  standNumber: string,
  customerCategory: string,
  emailProvided: boolean,
  customerEmail?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    
    console.log(`Sending activation notification for ${standNumber}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-activation-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        customerName,
        standNumber,
        customerCategory,
        activationDateTime: new Date().toISOString(),
        emailProvided,
        customerEmail
      })
    });

    if (!response.ok) {
      console.error('Failed to send activation notification:', await response.text());
    } else {
      console.log('Activation notification sent successfully');
    }
  } catch (error) {
    console.error('Error sending activation notification:', error);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, code, email, password, standNumber }: VerifyOtpRequest = await req.json();

    // Input validation
    if (!phoneNumber || !code || !email || !password) {
      return new Response(
        JSON.stringify({ verified: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const trimmedPhone = phoneNumber.trim();
    const trimmedCode = code.trim();

    // Validate code format
    if (!/^\d{6}$/.test(trimmedCode)) {
      return new Response(
        JSON.stringify({ verified: false, error: "Invalid verification code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting
    cleanupRateLimits();
    const rateLimitKey = trimmedPhone;
    const attemptRecord = verificationAttempts.get(rateLimitKey);
    
    if (attemptRecord) {
      if (Date.now() - attemptRecord.firstAttempt < RATE_LIMIT_WINDOW_MS) {
        if (attemptRecord.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          console.log(`OTP verification rate limit exceeded for phone: ${trimmedPhone}`);
          return new Response(
            JSON.stringify({ verified: false, error: "Too many verification attempts. Please request a new code." }),
            { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        attemptRecord.count++;
      } else {
        verificationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
      }
    } else {
      verificationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
    }

    console.log(`Verifying OTP for phone: ${trimmedPhone}`);

    // Verify with Twilio
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return new Response(
        JSON.stringify({ verified: false, error: "Verification service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        To: trimmedPhone,
        Code: trimmedCode
      })
    });

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok || twilioData.status !== 'approved') {
      console.log('OTP verification failed:', twilioData);
      return new Response(
        JSON.stringify({ 
          verified: false, 
          error: "Invalid or expired verification code. Please try again." 
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('OTP verified successfully');

    // Clear rate limit on successful verification
    verificationAttempts.delete(rateLimitKey);

    // Sign in the user to create a session
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (signInError) {
      console.error('Failed to sign in after OTP verification:', signInError);
      return new Response(
        JSON.stringify({ 
          verified: true, 
          signedIn: false,
          error: "Verification successful but sign-in failed. Please try logging in." 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('User signed in after OTP verification');

    // ==================== EMAIL SYNC & ACTIVATION NOTIFICATION ====================
    // These are additive, non-blocking operations - failures don't affect the user
    
    let syncResult: { synced: boolean; customerName?: string; customerCategory?: string } = { synced: false };
    const emailProvided: boolean = !!(email && !email.includes('@lakecity.portal'));
    
    if (standNumber) {
      // Attempt email sync only if all conditions are met
      if (emailProvided) {
        try {
          syncResult = await syncEmailToSheet(standNumber, trimmedPhone, email);
          console.log(`Email sync result for ${standNumber}: synced=${syncResult.synced}`);
        } catch (syncError) {
          console.error('Email sync error (non-blocking):', syncError);
        }
      }

      // Send activation notification (always, even if sync fails)
      try {
        await sendActivationNotification(
          syncResult.customerName || 'Customer',
          standNumber,
          syncResult.customerCategory || 'Unknown',
          emailProvided,
          emailProvided ? email : undefined
        );
      } catch (notifError) {
        console.error('Activation notification error (non-blocking):', notifError);
      }
    }

    return new Response(
      JSON.stringify({ 
        verified: true,
        signedIn: true,
        session: signInData.session,
        message: "Phone verified and signed in successfully!"
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in verify-signup-otp function:", error);
    return new Response(
      JSON.stringify({ verified: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
