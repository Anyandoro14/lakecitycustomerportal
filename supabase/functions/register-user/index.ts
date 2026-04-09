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

interface RegisterUserRequest {
  standNumber: string;
  phoneNumber: string;
  password: string;
  email?: string;
  /** Matches Collection Schedule tab "Collection Schedule - Nmo" (or legacy "N Months") from validate-signup */
  paymentPlanMonths?: number;
}

// Rate limiting: max 3 registration attempts per phone per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const registrationAttempts = new Map<string, { count: number; firstAttempt: number }>();

// Clean up old rate limit entries
const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [key, value] of registrationAttempts.entries()) {
    if (now - value.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      registrationAttempts.delete(key);
    }
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { standNumber, phoneNumber, password, email, paymentPlanMonths }: RegisterUserRequest =
      await req.json();

    // Input validation
    if (!standNumber || typeof standNumber !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: "Stand number is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: "Phone number is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: "Password is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const trimmedStand = standNumber.trim();
    const trimmedPhone = phoneNumber.trim();
    const planMonths =
      typeof paymentPlanMonths === "number" && paymentPlanMonths > 0
        ? Math.round(paymentPlanMonths)
        : 36;

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting check
    cleanupRateLimits();
    const rateLimitKey = trimmedPhone;
    const attemptRecord = registrationAttempts.get(rateLimitKey);
    
    if (attemptRecord) {
      if (Date.now() - attemptRecord.firstAttempt < RATE_LIMIT_WINDOW_MS) {
        if (attemptRecord.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          console.log(`Registration rate limit exceeded for phone: ${trimmedPhone}`);
          return new Response(
            JSON.stringify({ success: false, error: "Too many registration attempts. Please try again later." }),
            { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        attemptRecord.count++;
      } else {
        registrationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
      }
    } else {
      registrationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
    }

    console.log(`Registering user for stand: ${trimmedStand}`);

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

    // Double-check no existing account for this stand number
    let existingProfileQuery = supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stand_number', trimmedStand);
    if (tenantId) existingProfileQuery = existingProfileQuery.eq('tenant_id', tenantId);
    const { data: existingProfile } = await existingProfileQuery.maybeSingle();

    if (existingProfile) {
      console.log(`Account already exists for stand number: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "An account already exists for this stand number. Please login instead." 
        }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate a unique email for Supabase auth (stand-based)
    // If user provided email, use it; otherwise generate a placeholder
    const authEmail = email && email.includes('@') 
      ? email.trim().toLowerCase()
      : `stand-${trimmedStand.toLowerCase().replace(/[^a-z0-9]/g, '')}@lakecity.portal`;

    // Check if email already exists
    let existingByEmailQuery = supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', authEmail);
    if (tenantId) existingByEmailQuery = existingByEmailQuery.eq('tenant_id', tenantId);
    const { data: existingByEmail } = await existingByEmailQuery.maybeSingle();

    if (existingByEmail) {
      console.log(`Email already in use: ${authEmail}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "This email is already associated with another account." 
        }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: password,
      email_confirm: true, // Auto-confirm since we're using phone-based verification
      user_metadata: {
        stand_number: trimmedStand,
        phone_number: trimmedPhone
      }
    });

    if (authError) {
      console.error('Failed to create auth user:', authError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create account. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = authData.user.id;
    console.log(`Created auth user: ${userId}`);

    // Update profile with stand number and phone
    let profileUpdateQuery = supabaseAdmin
      .from('profiles')
      .update({
        stand_number: trimmedStand,
        phone_number: trimmedPhone,
        email: authEmail,
        payment_plan_months: planMonths,
      })
      .eq('id', userId);
    if (tenantId) profileUpdateQuery = profileUpdateQuery.eq('tenant_id', tenantId);
    const { error: profileError } = await profileUpdateQuery;

    if (profileError) {
      console.error('Failed to update profile:', profileError);
      // Don't fail the whole registration, the profile will be updated on first login
    }

    // Send WhatsApp 2FA code via Twilio Verify
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      console.error("Twilio credentials not configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Verification service not configured. Please contact support." 
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
    let deliveryChannel = 'whatsapp';
    
    console.log(`Sending 2FA code to ${trimmedPhone} via WhatsApp`);
    
    let twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        To: trimmedPhone,
        Channel: 'whatsapp'
      })
    });

    let twilioData = await twilioResponse.json();

    // Fallback to SMS if WhatsApp fails
    if (!twilioResponse.ok) {
      console.log('WhatsApp failed, falling back to SMS:', twilioData.message);
      deliveryChannel = 'sms';
      
      twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
        },
        body: new URLSearchParams({
          To: trimmedPhone,
          Channel: 'sms'
        })
      });

      twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        console.error('SMS also failed:', twilioData);
        // Don't delete the user, they can request a new code
        return new Response(
          JSON.stringify({ 
            success: true, 
            userId: userId,
            verificationSent: false,
            error: "Account created but failed to send verification code. Please try logging in."
          }),
          { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    console.log(`2FA code sent via ${deliveryChannel}:`, twilioData.sid);

    // Mask phone number for response
    const maskedPhone = trimmedPhone.replace(/(\+\d{1,3})(\d+)(\d{4})$/, '$1****$3');

    return new Response(
      JSON.stringify({ 
        success: true,
        userId: userId,
        email: authEmail,
        phoneNumber: maskedPhone,
        channel: deliveryChannel,
        verificationSent: true,
        message: `Account created! Verification code sent via ${deliveryChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`
      }),
      { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in register-user function:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
