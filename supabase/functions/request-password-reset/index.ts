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

// Rate limiting: max 3 requests per phone per hour
const RATE_LIMIT_WINDOW_HOURS = 1;
const RATE_LIMIT_MAX_REQUESTS = 3;

interface RequestResetRequest {
  standNumber: string;
}

// Helper functions for JWT signing (for Google Sheets API)
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
    const { standNumber }: RequestResetRequest = await req.json();

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

    console.log(`Password reset requested for stand number: ${trimmedStand}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // First check profiles table for user with this stand number
    let email: string | null = null;
    let phoneNumber: string | null = null;
    let userId: string | null = null;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, phone_number, stand_number')
      .eq('stand_number', trimmedStand)
      .maybeSingle();

    if (profile?.email && profile?.phone_number) {
      email = profile.email;
      phoneNumber = profile.phone_number;
      userId = profile.id;
      console.log(`Found user in profiles by stand_number: ${email}`);
    } else {
      // Look up in Google Sheets
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

      if (serviceAccountEmail && privateKeyPem) {
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

        if (tokenResponse.ok) {
          const { access_token } = await tokenResponse.json();
          const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
          
          if (spreadsheetId) {
            const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            const metadataResponse = await fetch(metadataUrl, {
              headers: { Authorization: `Bearer ${access_token}` },
            });

            if (metadataResponse.ok) {
              const metadata = await metadataResponse.json();
              const sheets = metadata.sheets || [];
              const sheetTitle = sheets.length > 0 ? sheets[0].properties.title : 'Sheet1';

              const range = encodeURIComponent(`${sheetTitle}!A:AZ`);
              const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
              
              const response = await fetch(url, {
                headers: { Authorization: `Bearer ${access_token}` },
              });

              if (response.ok) {
                const data = await response.json();
                const rows = data.values || [];

                if (rows.length > 0) {
                  const headers = rows[0];
                  const standNumIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('stand'));
                  const emailIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('email'));

                  if (standNumIndex !== -1 && emailIndex !== -1) {
                    const customerRow = rows.slice(1).find((row: string[]) => 
                      row[standNumIndex] && row[standNumIndex].toString().trim().toLowerCase() === trimmedStand.toLowerCase()
                    );

                    if (customerRow && customerRow[emailIndex]) {
                      email = customerRow[emailIndex].toString().trim();
                      console.log(`Found email in Google Sheets: ${email}`);

                      // Look up user by email to get phone number
                      const { data: profileByEmail } = await supabaseAdmin
                        .from('profiles')
                        .select('id, phone_number')
                        .eq('email', email)
                        .maybeSingle();

                      if (profileByEmail) {
                        userId = profileByEmail.id;
                        phoneNumber = profileByEmail.phone_number;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Security: Don't reveal if account exists, but do return appropriate response
    // If no phone number, route to support
    if (!email || !userId) {
      console.log(`No account found for stand number: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "If your stand number is registered, you will receive a verification code.",
          requiresSupport: false 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!phoneNumber) {
      console.log(`No phone number for user: ${userId}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          requiresSupport: true,
          message: "No verified phone number on file. Please contact support to reset your password."
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check rate limiting
    const hourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentTokens, error: countError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', hourAgo);

    if (countError) {
      console.error('Error checking rate limit:', countError);
    } else if (recentTokens && recentTokens.length >= RATE_LIMIT_MAX_REQUESTS) {
      console.log(`Rate limit exceeded for user: ${userId}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Too many reset attempts. Please try again later or contact support."
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Invalidate any existing tokens for this user
    await supabaseAdmin
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', userId)
      .is('used_at', null);

    // Create new reset token record (we use Twilio Verify, so no need to store our own token)
    const { error: insertError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: userId,
        phone_number: phoneNumber,
        token_hash: 'twilio-verify', // Marker that we're using Twilio's token
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      });

    if (insertError) {
      console.error('Error creating reset token:', insertError);
      throw new Error('Failed to initiate password reset');
    }

    // Send verification code via Twilio Verify (WhatsApp first, SMS fallback)
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      throw new Error("Twilio credentials not configured");
    }

    const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
    let deliveryChannel = 'whatsapp';
    let twilioData: any;

    // Try WhatsApp first
    console.log(`Attempting WhatsApp delivery to ${phoneNumber}`);
    
    let twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Channel: 'whatsapp'
      })
    });

    twilioData = await twilioResponse.json();

    // If WhatsApp fails, fall back to SMS
    if (!twilioResponse.ok) {
      console.log('WhatsApp delivery failed, falling back to SMS:', twilioData.message || twilioData.code);
      deliveryChannel = 'sms';
      
      twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
        },
        body: new URLSearchParams({
          To: phoneNumber,
          Channel: 'sms'
        })
      });

      twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        console.error('SMS delivery also failed:', twilioData);
        throw new Error(twilioData.message || 'Failed to send verification code');
      }
    }

    console.log(`Password reset code sent via ${deliveryChannel}:`, twilioData.sid);

    // Mask phone number for response
    const maskedPhone = phoneNumber.replace(/(\+\d{1,3})(\d+)(\d{4})$/, '$1****$3');
    const channelMessage = deliveryChannel === 'whatsapp' 
      ? "Verification code sent to your WhatsApp" 
      : "Verification code sent via SMS";

    return new Response(
      JSON.stringify({ 
        success: true,
        phoneNumber: maskedPhone,
        channel: deliveryChannel,
        message: channelMessage
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in request-password-reset function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
