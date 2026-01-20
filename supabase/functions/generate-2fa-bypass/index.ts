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

    const { phoneNumber, standNumber, customerName }: GenerateBypassRequest = await req.json();

    if (!phoneNumber || !standNumber) {
      throw new Error('Phone number and stand number are required');
    }

    console.log(`Admin ${internalUser.email} generating bypass code for stand ${standNumber}`);

    // Generate the bypass code
    const bypassCode = generateBypassCode();

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
        customer_name: customerName || null
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
          phone_number_masked: phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-2)
        }
      });

    console.log(`Bypass code generated successfully for stand ${standNumber}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        bypassCode,
        expiresInMinutes: 5
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
