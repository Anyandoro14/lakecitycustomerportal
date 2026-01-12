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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, code, email, password }: VerifyOtpRequest = await req.json();

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
