import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateBypassRequest {
  phoneNumber: string;
  standNumber: string;
  customerName?: string;
  durationWeeks?: number; // 0 = 5 minutes (quick), 1-4 = weeks (reusable), -1 = permanent
}

const generateBypassCode = (): string => {
  // Generate a 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    // Create client with user's token to verify they're authenticated
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Must be logged in');
    }

    // Use service role client to check if user is internal staff
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: internalUser, error: roleError } = await supabaseAdmin
      .from('internal_users')
      .select('id, email, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError || !internalUser) {
      throw new Error('Unauthorized: Only internal staff can generate bypass codes');
    }

    const { phoneNumber, standNumber, customerName, durationWeeks = 0 }: GenerateBypassRequest = await req.json();

    if (!phoneNumber || !standNumber) {
      throw new Error('Phone number and stand number are required');
    }

    // Validate duration (0 = 5 min quick, 1-4 = weeks, -1 = permanent)
    const isPermanent = durationWeeks === -1;
    const validDuration = isPermanent ? -1 : Math.min(Math.max(0, durationWeeks), 4);
    const isReusable = validDuration > 0 || isPermanent;

    const durationLabel = isPermanent ? 'permanent' : (isReusable ? `${validDuration}-week reusable` : '5-minute');
    console.log(`Admin ${internalUser.email} generating ${durationLabel} bypass code for stand ${standNumber}`);

    // Generate the bypass code
    const bypassCode = generateBypassCode();

    // Calculate expiry
    let expiresAt: Date;
    if (isPermanent) {
      // 10 years (effectively permanent)
      expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    } else if (isReusable) {
      // Weeks duration
      expiresAt = new Date(Date.now() + validDuration * 7 * 24 * 60 * 60 * 1000);
    } else {
      // 5 minutes
      expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    }

    // Delete any existing unused bypass codes for this phone number
    await supabaseAdmin
      .from('twofa_bypass_codes')
      .delete()
      .eq('phone_number', phoneNumber)
      .is('used_at', null);

    // Insert the new bypass code
    const { error: insertError } = await supabaseAdmin
      .from('twofa_bypass_codes')
      .insert({
        phone_number: phoneNumber,
        stand_number: standNumber,
        bypass_code: bypassCode,
        created_by: user.id,
        created_by_email: internalUser.email,
        customer_name: customerName || null,
        expires_at: expiresAt.toISOString(),
        is_reusable: isReusable
      });

    if (insertError) {
      console.error('Failed to insert bypass code:', insertError);
      throw new Error('Failed to generate bypass code');
    }

    // Log to audit_log
    await supabaseAdmin
      .from('audit_log')
      .insert({
        action: '2fa_bypass_generated',
        entity_type: 'twofa_bypass',
        entity_id: standNumber,
        performed_by: user.id,
        performed_by_email: internalUser.email,
        details: {
          stand_number: standNumber,
          customer_name: customerName,
          phone_number_masked: phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-2),
          duration_type: isPermanent ? 'permanent' : (isReusable ? `${validDuration} week(s)` : '5 minutes'),
          is_reusable: isReusable,
          is_permanent: isPermanent,
          expires_at: expiresAt.toISOString()
        }
      });

    console.log(`Bypass code generated successfully for stand ${standNumber}, expires: ${expiresAt.toISOString()}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        bypassCode,
        isReusable,
        expiresAt: expiresAt.toISOString(),
        durationWeeks: validDuration
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-2fa-bypass function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message.includes('Unauthorized') ? 401 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
