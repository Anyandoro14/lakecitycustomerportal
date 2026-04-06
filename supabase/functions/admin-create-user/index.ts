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
    const { standNumber, email, phoneNumber, password } = await req.json();

    if (!standNumber || !email || !phoneNumber || !password) {
      return new Response(
        JSON.stringify({ error: "standNumber, email, phoneNumber, and password are required" }),
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

    console.log(`Creating account for stand: ${standNumber}, email: ${email}, phone: ${phoneNumber}`);

    // Check if profile already exists for this stand
    let existingProfileQuery = supabaseAdmin
      .from('profiles')
      .select('id, stand_number')
      .eq('stand_number', standNumber);
    if (tenantId) existingProfileQuery = existingProfileQuery.eq('tenant_id', tenantId);
    const { data: existingProfile } = await existingProfileQuery.maybeSingle();

    if (existingProfile) {
      console.log(`Account already exists for stand ${standNumber}`);
      return new Response(
        JSON.stringify({ error: `Account already exists for stand ${standNumber}`, existingProfile }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if email already exists in auth
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      console.log(`Email ${email} already exists, updating profile with stand number`);
      
      // Update the profile with the stand number and phone
      let updateQuery = supabaseAdmin
        .from('profiles')
        .update({
          stand_number: standNumber,
          phone_number: phoneNumber
        })
        .eq('id', existingUser.id);
      if (tenantId) updateQuery = updateQuery.eq('tenant_id', tenantId);
      const { error: updateError } = await updateQuery;

      if (updateError) {
        console.error("Error updating profile:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update profile", details: updateError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update password
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { password }
      );

      if (pwError) {
        console.error("Error updating password:", pwError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Account updated with stand number and new password",
          userId: existingUser.id,
          email: email,
          standNumber: standNumber
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        stand_number: standNumber,
        phone_number: phoneNumber
      }
    });

    if (authError) {
      console.error("Error creating user:", authError);
      return new Response(
        JSON.stringify({ error: "Failed to create user", details: authError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    console.log(`Created auth user: ${userId}`);

    // Update profile with stand number and phone
    let profileUpdateQuery = supabaseAdmin
      .from('profiles')
      .update({
        stand_number: standNumber,
        phone_number: phoneNumber,
        email: email.toLowerCase()
      })
      .eq('id', userId);
    if (tenantId) profileUpdateQuery = profileUpdateQuery.eq('tenant_id', tenantId);
    const { error: profileError } = await profileUpdateQuery;

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Try inserting if update failed (in case trigger didn't create it)
      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          stand_number: standNumber,
          phone_number: phoneNumber,
          email: email.toLowerCase(),
          ...(tenantId ? { tenant_id: tenantId } : {})
        });

      if (insertError) {
        console.error("Error inserting profile:", insertError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Account created successfully",
        userId: userId,
        email: email,
        standNumber: standNumber
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
