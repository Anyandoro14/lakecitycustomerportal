import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  emailsMatch,
  hashCode,
  loadProfileDestinations,
  maskEmail,
  normalizeEmail,
  phonesMatch,
  type OtpChannel,
} from "../_shared/otp-destinations.ts";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyCodeRequest {
  userId?: string;
  phoneNumber?: string;
  email?: string;
  code: string;
  channel?: OtpChannel;
}

const deny = (error: string, status = 'failed') =>
  new Response(JSON.stringify({ verified: false, status, error }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, phoneNumber, email, code, channel = 'sms' }: VerifyCodeRequest = await req.json();

    if (!code) {
      return deny("Please enter the verification code.");
    }

    const validChannel: OtpChannel = channel === 'email' ? 'email' : 'sms';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let profile: { email: string | null; phones: string[] } | null = null;
    if (userId) {
      profile = await loadProfileDestinations(supabaseAdmin, userId);
      if (!profile) {
        return deny("We couldn't find your account details. Please try signing in again.");
      }
    }

    // ---------------- Email channel ----------------
    if (validChannel === 'email') {
      const target = profile?.email ?? email ?? null;
      if (!target) {
        return deny("There's no email address on file for this account.");
      }
      if (profile?.email && email && !emailsMatch(email, profile.email)) {
        console.warn('[2FA] Email destination mismatch rejected for user', userId);
        return deny("That email address doesn't match the one on your account.");
      }

      const normalized = normalizeEmail(target);
      const { data: row, error: rowError } = await supabaseAdmin
        .from('email_otp_codes')
        .select('*')
        .eq('email', normalized)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rowError || !row) {
        return deny("That code has expired or was already used. Please request a new one.");
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        return deny("That code has expired. Please request a new one.");
      }

      if (row.attempts >= row.max_attempts) {
        await supabaseAdmin
          .from('email_otp_codes')
          .update({ consumed_at: new Date().toISOString() })
          .eq('id', row.id);
        return deny("Too many incorrect attempts. Please request a new code.");
      }

      const candidate = await hashCode(String(code).trim(), row.salt);
      if (candidate !== row.code_hash) {
        await supabaseAdmin
          .from('email_otp_codes')
          .update({ attempts: row.attempts + 1 })
          .eq('id', row.id);
        console.log('[2FA] Incorrect email code for', maskEmail(normalized));
        return deny("Incorrect code. Please double-check and try again, or request a new one.");
      }

      await supabaseAdmin
        .from('email_otp_codes')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', row.id);

      console.log('[2FA] Email verification approved for', maskEmail(normalized));

      return new Response(
        JSON.stringify({ verified: true, status: 'approved', channel: 'email' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ---------------- SMS channel ----------------
    let target = phoneNumber ?? null;
    if (profile) {
      if (target) {
        const matched = profile.phones.find((p) => phonesMatch(p, target));
        if (!matched) {
          console.warn('[2FA] Phone destination mismatch rejected for user', userId);
          return deny("That phone number doesn't match the one on your account.");
        }
        target = matched;
      } else {
        target = profile.phones[0] ?? null;
      }
    }

    if (!target) {
      return deny("There's no phone number on file for this account.");
    }

    console.log(`Verifying code for a stored phone number`);

    // First, check if this is an admin bypass code
    const { data: bypassCode, error: bypassError } = await supabaseAdmin
      .from('twofa_bypass_codes')
      .select('*')
      .eq('phone_number', target)
      .eq('bypass_code', code)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    const isValidBypass = bypassCode && !bypassError && (
      bypassCode.used_at === null || bypassCode.is_reusable === true
    );

    if (isValidBypass) {
      const isReusable = bypassCode.is_reusable === true;
      console.log(`Valid ${isReusable ? 'reusable' : 'single-use'} bypass code used`);

      if (!isReusable) {
        await supabaseAdmin
          .from('twofa_bypass_codes')
          .update({ used_at: new Date().toISOString() })
          .eq('id', bypassCode.id);
      }

      await supabaseAdmin
        .from('audit_log')
        .insert({
          action: '2fa_bypass_used',
          entity_type: 'twofa_bypass',
          entity_id: bypassCode.stand_number,
          performed_by: bypassCode.created_by,
          performed_by_email: bypassCode.created_by_email,
          details: {
            stand_number: bypassCode.stand_number,
            customer_name: bypassCode.customer_name,
            phone_number_masked: target.slice(0, 4) + '****' + target.slice(-2),
            bypass_code_id: bypassCode.id,
            is_reusable: isReusable,
          },
        });

      return new Response(
        JSON.stringify({ verified: true, status: 'approved', bypassUsed: true, isReusable, channel: 'sms' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return deny("Verification service is temporarily unavailable. Please try again.");
    }

    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: new URLSearchParams({ To: target, Code: code }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      return deny((data as any)?.message || 'The code has expired or is no longer valid. Please request a new one.');
    }

    const verified = data.status === 'approved';
    console.log(`Verification result: ${verified ? 'success' : 'failed'} (status=${data.status})`);

    return new Response(
      JSON.stringify({
        verified,
        status: data.status,
        channel: 'sms',
        error: verified ? undefined : 'Incorrect code. Please double-check and try again, or request a new one.',
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Error in verify-2fa-code function:", error?.message);
    return deny(error?.message || 'Verification service is temporarily unavailable. Please try again.', 'error');
  }
};

serve(handler);
