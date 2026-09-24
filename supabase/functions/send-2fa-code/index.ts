import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import {
  emailsMatch,
  generateNumericCode,
  hashCode,
  loadProfileDestinations,
  maskEmail,
  maskPhone,
  normalizeEmail,
  phonesMatch,
  randomSalt,
  type OtpChannel,
} from "../_shared/otp-destinations.ts";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const EMAIL_OTP_TTL_MINUTES = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendCodeRequest {
  userId?: string;
  phoneNumber?: string;
  email?: string;
  channel?: OtpChannel;
}

const fail = (error: string) =>
  new Response(JSON.stringify({ success: false, error }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const otpEmailHtml = (code: string) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f5;font-family:Inter,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f5;padding:32px 16px;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7e5;">
          <tr><td style="background:#0E4D3C;padding:24px 28px;">
            <div style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.02em;">LakeCity</div>
          </td></tr>
          <tr><td style="padding:32px 28px;">
            <h1 style="margin:0 0 12px;font-family:Georgia,'Playfair Display',serif;font-size:22px;color:#111813;">Your sign-in code</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4a544c;">
              Use the code below to finish signing in to your LakeCity account. It expires in ${EMAIL_OTP_TTL_MINUTES} minutes.
            </p>
            <div style="text-align:center;margin:0 0 24px;">
              <span style="display:inline-block;background:#f0f5f2;border:1px solid #d5e3db;border-radius:10px;padding:16px 28px;font-size:30px;font-weight:700;letter-spacing:10px;color:#0E4D3C;">${code}</span>
            </div>
            <p style="margin:0;font-size:13px;line-height:1.7;color:#7a837c;">
              If you didn't try to sign in, you can ignore this email. Never share this code with anyone.
            </p>
          </td></tr>
          <tr><td style="padding:18px 28px;background:#fafbfa;border-top:1px solid #eef1ef;font-size:12px;color:#8a938c;">
            Need help? Contact us at info@lakecity.co.zw
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, phoneNumber, email, channel = 'sms' }: SendCodeRequest = await req.json();

    const validChannel: OtpChannel = channel === 'email' ? 'email' : 'sms';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve the allowed destinations from the profile, server-side.
    let profile: { email: string | null; phones: string[] } | null = null;
    if (userId) {
      profile = await loadProfileDestinations(supabaseAdmin, userId);
      if (!profile) {
        return fail("We couldn't find your account details. Please try signing in again.");
      }
    }

    if (validChannel === 'email') {
      // Destination must be the profile email. Never accept a client-typed address.
      const target = profile?.email ?? null;
      if (!target) {
        return fail("There's no email address on file for this account. Please use SMS or contact support.");
      }
      if (email && !emailsMatch(email, target)) {
        console.warn('[2FA] Email destination mismatch rejected for user', userId);
        return fail("That email address doesn't match the one on your account.");
      }

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) {
        return fail("Email delivery isn't available right now. Please use SMS or contact support.");
      }

      const code = generateNumericCode(6);
      const salt = randomSalt();
      const code_hash = await hashCode(code, salt);
      const expires_at = new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60 * 1000).toISOString();

      // Invalidate any outstanding codes for this address.
      await supabaseAdmin
        .from('email_otp_codes')
        .update({ consumed_at: new Date().toISOString() })
        .is('consumed_at', null)
        .eq('email', normalizeEmail(target));

      const { error: insertError } = await supabaseAdmin
        .from('email_otp_codes')
        .insert({
          user_id: userId ?? null,
          email: normalizeEmail(target),
          code_hash,
          salt,
          expires_at,
        });

      if (insertError) {
        console.error('[2FA] Failed to store email code:', insertError.message);
        return fail("We couldn't prepare your code. Please try again.");
      }

      const resend = new Resend(resendKey);
      const emailResponse = await resend.emails.send({
        from: 'LakeCity <noreply@noreply.lakecity.co.zw>',
        to: [target],
        subject: 'Your LakeCity sign-in code',
        html: otpEmailHtml(code),
      });

      if (emailResponse.error) {
        console.error('[2FA] Resend error:', emailResponse.error);
        return fail("We couldn't send the code to your email. Please try again or use SMS.");
      }

      console.log('[2FA] Email code sent', { userId, destination: maskEmail(target) });

      return new Response(
        JSON.stringify({
          success: true,
          channel: 'email',
          requestedChannel: 'email',
          maskedDestination: maskEmail(target),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ---- SMS via Twilio Verify ----
    let target = phoneNumber ?? null;
    if (profile) {
      if (target) {
        const matched = profile.phones.find((p) => phonesMatch(p, target));
        if (!matched) {
          console.warn('[2FA] Phone destination mismatch rejected for user', userId);
          return fail("That phone number doesn't match the one on your account.");
        }
        target = matched; // always send to the stored formatting
      } else {
        target = profile.phones[0] ?? null;
      }
    }

    if (!target) {
      return fail("There's no phone number on file for this account. Please use email or contact support.");
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return fail("SMS delivery isn't configured. Please use email or contact support.");
    }

    console.log(`[2FA] Sending SMS verification code to ${maskPhone(target)}`);

    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: new URLSearchParams({ To: target, Channel: 'sms' }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[2FA] Twilio error:', data);
      return fail((data as any)?.message || 'Failed to send verification code');
    }

    const sendAttempts = Array.isArray((data as any)?.send_code_attempts)
      ? (data as any).send_code_attempts.map((a: any) => ({
          channel: a?.channel,
          time: a?.time,
          attempt_sid: a?.attempt_sid,
          error_code: a?.error_code,
        }))
      : undefined;

    console.log('[2FA] Verification code accepted by Twilio:', {
      sid: (data as any)?.sid,
      requestedChannel: 'sms',
      twilioChannel: (data as any)?.channel,
      status: (data as any)?.status,
      send_code_attempts: sendAttempts,
    });

    return new Response(
      JSON.stringify({
        success: true,
        channel: 'sms',
        sid: (data as any)?.sid,
        requestedChannel: 'sms',
        twilioChannel: (data as any)?.channel,
        status: (data as any)?.status,
        sendCodeAttempts: sendAttempts,
        maskedDestination: maskPhone(target),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Error in send-2fa-code function:", error?.message);
    return fail(error?.message || 'Unable to send verification code right now. Please try again or contact support.');
  }
};

serve(handler);
