import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LookupRequest {
  standNumber: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { standNumber }: LookupRequest = await req.json();

    if (!standNumber || typeof standNumber !== 'string') {
      return new Response(
        JSON.stringify({ error: "Stand number is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate stand number format (alphanumeric, max 50 chars)
    const trimmedStand = standNumber.trim();
    if (trimmedStand.length === 0 || trimmedStand.length > 50) {
      return new Response(
        JSON.stringify({ error: "Invalid stand number format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Looking up email for stand number: ${trimmedStand}`);

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('email, phone_number')
      .eq('stand_number', trimmedStand)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to lookup stand number');
    }

    if (!profile || !profile.email) {
      console.log(`No account found for stand number: ${trimmedStand}`);
      return new Response(
        JSON.stringify({ 
          found: false, 
          error: "No account found for this stand number" 
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found account for stand number: ${trimmedStand}`);

    // Return email and whether phone exists (for 2FA indication)
    // Don't return the actual phone number for security
    return new Response(
      JSON.stringify({ 
        found: true,
        email: profile.email,
        hasPhone: !!profile.phone_number
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in lookup-stand-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
