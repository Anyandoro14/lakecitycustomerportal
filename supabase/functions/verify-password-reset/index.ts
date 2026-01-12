import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_VERIFICATION_ATTEMPTS = 5;

interface VerifyResetRequest {
  standNumber: string;
  code: string;
  newPassword: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { standNumber, code, newPassword }: VerifyResetRequest = await req.json();

    // Validate inputs
    if (!standNumber || !code || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Stand number, code, and new password are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return new Response(
        JSON.stringify({ error: "Password must contain uppercase, lowercase, and a number" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const trimmedStand = standNumber.trim();
    console.log(`Verifying password reset for stand number: ${trimmedStand}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find the user by stand number
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, phone_number')
      .eq('stand_number', trimmedStand)
      .maybeSingle();

    if (!profile || !profile.phone_number) {
      console.log(`No profile found for stand number: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ error: "Invalid reset request. Please start over." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the pending reset token
    const { data: resetToken, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('user_id', profile.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !resetToken) {
      console.log(`No valid reset token found for user: ${profile.id}`);
      return new Response(
        JSON.stringify({ error: "Reset request has expired. Please request a new code." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check attempts
    if (resetToken.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      console.log(`Max attempts exceeded for token: ${resetToken.id}`);
      // Mark token as used (exhausted)
      await supabaseAdmin
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', resetToken.id);

      return new Response(
        JSON.stringify({ error: "Too many failed attempts. Please request a new code." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Increment attempts
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ attempts: resetToken.attempts + 1 })
      .eq('id', resetToken.id);

    // Verify code with Twilio
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      throw new Error("Twilio credentials not configured");
    }

    console.log(`Verifying code for phone: ${profile.phone_number}`);

    const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        To: profile.phone_number,
        Code: code
      })
    });

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('Twilio verification error:', twilioData);
      return new Response(
        JSON.stringify({ error: "Verification failed. Please try again." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (twilioData.status !== 'approved') {
      console.log(`Verification failed: ${twilioData.status}`);
      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - (resetToken.attempts + 1);
      return new Response(
        JSON.stringify({ 
          error: `Invalid code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('Verification successful, updating password');

    // Mark token as used
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', resetToken.id);

    // Update the user's password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      throw new Error('Failed to update password');
    }

    console.log(`Password successfully reset for user: ${profile.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Password has been successfully reset"
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in verify-password-reset function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
