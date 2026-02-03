import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendCodeRequest {
  phoneNumber: string;
  channel?: 'whatsapp' | 'sms';
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, channel = 'whatsapp' }: SendCodeRequest = await req.json();

    if (!phoneNumber) {
      throw new Error("Phone number is required");
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      throw new Error("Twilio credentials not configured");
    }

    // Validate channel
    const validChannel = channel === 'sms' ? 'sms' : 'whatsapp';
    console.log(`Sending ${validChannel.toUpperCase()} verification code to ${phoneNumber}`);

    // Send verification code using Twilio Verify API
    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Channel: validChannel
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      throw new Error(data.message || 'Failed to send verification code');
    }

    // Twilio Verify can silently fall back to SMS if WhatsApp is unavailable for the destination,
    // sender configuration is missing/misconfigured, or regional availability is impacted.
    // Log a sanitized summary so we can confirm which channel Twilio actually used.
    const sendAttempts = Array.isArray((data as any)?.send_code_attempts)
      ? (data as any).send_code_attempts.map((a: any) => ({
          channel: a?.channel,
          time: a?.time,
          attempt_sid: a?.attempt_sid,
          error_code: a?.error_code,
        }))
      : undefined;

    console.log('Verification code accepted by Twilio:', {
      sid: (data as any)?.sid,
      requestedChannel: validChannel,
      twilioChannel: (data as any)?.channel,
      status: (data as any)?.status,
      send_code_attempts: sendAttempts,
    });

    return new Response(
      JSON.stringify({
        success: true,
        sid: (data as any)?.sid,
        requestedChannel: validChannel,
        twilioChannel: (data as any)?.channel,
        status: (data as any)?.status,
        sendCodeAttempts: sendAttempts,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-2fa-code function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
