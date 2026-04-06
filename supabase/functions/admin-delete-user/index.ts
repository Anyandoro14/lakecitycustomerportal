import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, standNumber } = await req.json();

    if (!userId && !standNumber) {
      return new Response(
        JSON.stringify({ error: "userId or standNumber is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Extract tenant_id from JWT app_metadata
    const authHeader = req.headers.get('Authorization');
    let tenantId: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const userToken = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
      tenantId = user?.app_metadata?.tenant_id;
    }

    let targetUserId = userId;

    // If standNumber provided, look up the user
    if (standNumber && !userId) {
      let profileQuery = supabaseAdmin
        .from('profiles')
        .select('id, email')
        .eq('stand_number', standNumber);
      if (tenantId) profileQuery = profileQuery.eq('tenant_id', tenantId);
      const { data: profile } = await profileQuery.maybeSingle();

      if (!profile) {
        // Try to find in auth users by checking all profiles
        console.log(`No profile found for stand ${standNumber}, checking auth users...`);
      } else {
        targetUserId = profile.id;
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Deleting user: ${targetUserId}`);

    // Delete bypass codes if stand number provided
    if (standNumber) {
      const { error: bypassError } = await supabaseAdmin
        .from('twofa_bypass_codes')
        .delete()
        .eq('stand_number', standNumber);
      
      if (bypassError) {
        console.log('Error deleting bypass codes:', bypassError);
      }
    }

    // Delete profile
    let deleteProfileQuery = supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', targetUserId);
    if (tenantId) deleteProfileQuery = deleteProfileQuery.eq('tenant_id', tenantId);
    const { error: profileError } = await deleteProfileQuery;

    if (profileError) {
      console.log('Error deleting profile:', profileError);
    }

    // Delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user", details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted user: ${targetUserId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "User account deleted successfully",
        userId: targetUserId
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
