import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, standNumber, phone, newPassword } = await req.json();

    // Count how many lookup fields are provided
    const lookupFields = [email, standNumber, phone].filter(Boolean);
    
    if (lookupFields.length < 2) {
      return new Response(
        JSON.stringify({ error: "At least 2 lookup fields (email, stand number, phone) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newPassword) {
      return new Response(
        JSON.stringify({ error: "New password is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Extract tenant_id from JWT app_metadata
    const authHeaderForTenant = req.headers.get('Authorization');
    let tenantId: string | undefined;
    if (authHeaderForTenant?.startsWith('Bearer ')) {
      const userToken = authHeaderForTenant.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
      tenantId = user?.app_metadata?.tenant_id;
    }

    // Build query to find customer profile based on provided fields
    let query = supabaseAdmin.from("profiles").select("*");
    if (tenantId) query = query.eq('tenant_id', tenantId);

    if (standNumber) {
      query = query.ilike("stand_number", standNumber);
    }
    if (phone) {
      query = query.ilike("phone_number", `%${phone.replace(/^0/, "").replace(/^\+263/, "")}%`);
    }
    if (email) {
      query = query.ilike("email", email);
    }

    const { data: profiles, error: profileError } = await query;

    if (profileError) {
      console.error("Error finding profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to find customer" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No customer found matching the provided details" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profiles.length > 1) {
      return new Response(
        JSON.stringify({ error: "Multiple customers found. Please provide more specific details." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profile = profiles[0];
    const userId = profile.id;
    const userEmail = profile.email;

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "Customer does not have an email address on file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the user's password using auth admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the password reset in audit log
    const authHeader = req.headers.get("Authorization");
    let performedBy = null;
    let performedByEmail = null;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          performedBy = user.id;
          performedByEmail = user.email || null;
        }
      } catch (e) {
        console.error("Error getting user:", e);
      }
    }

    await supabaseAdmin.from("audit_log").insert({
      action: "PASSWORD_RESET",
      entity_type: "customer",
      entity_id: userId,
      performed_by: performedBy,
      performed_by_email: performedByEmail,
      ...(tenantId ? { tenant_id: tenantId } : {}),
      details: {
        customer_email: userEmail,
        stand_number: profile.stand_number,
        lookup_fields_used: { email: !!email, standNumber: !!standNumber, phone: !!phone }
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password updated successfully",
        customer: {
          email: userEmail,
          standNumber: profile.stand_number,
          name: profile.full_name
        }
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
