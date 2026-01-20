import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyCodeRequest {
  phoneNumber: string;
  code: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, code }: VerifyCodeRequest = await req.json();

    if (!phoneNumber || !code) {
      throw new Error("Phone number and code are required");
    }

    console.log(`Verifying code for ${phoneNumber}`);

    // First, check if this is an admin bypass code
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: bypassCode, error: bypassError } = await supabaseAdmin
      .from('twofa_bypass_codes')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('bypass_code', code)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    // Check if bypass code exists and is valid (either unused OR reusable)
    const isValidBypass = bypassCode && !bypassError && (
      bypassCode.used_at === null || bypassCode.is_reusable === true
    );

    if (isValidBypass) {
      const isReusable = bypassCode.is_reusable === true;
      console.log(`Valid ${isReusable ? 'reusable' : 'single-use'} bypass code used for ${phoneNumber}`);
      
      // Only mark as used if it's NOT a reusable code
      if (!isReusable) {
        await supabaseAdmin
          .from('twofa_bypass_codes')
          .update({ used_at: new Date().toISOString() })
          .eq('id', bypassCode.id);
      }

      // Log the bypass code usage to audit log
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
            phone_number_masked: phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-2),
            bypass_code_id: bypassCode.id,
            is_reusable: isReusable
          }
        });

      return new Response(
        JSON.stringify({ verified: true, status: 'approved', bypassUsed: true, isReusable }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Not a bypass code, verify with Twilio
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      throw new Error("Twilio credentials not configured");
    }

    console.log(`Verifying via Twilio for ${phoneNumber}`);

    // Verify code using Twilio Verify API
    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Code: code
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      throw new Error(data.message || 'Failed to verify code');
    }

    const verified = data.status === 'approved';
    console.log(`Verification result: ${verified ? 'success' : 'failed'}`);

    return new Response(
      JSON.stringify({ verified, status: data.status }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in verify-2fa-code function:", error);
    return new Response(
      JSON.stringify({ error: error.message, verified: false }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
