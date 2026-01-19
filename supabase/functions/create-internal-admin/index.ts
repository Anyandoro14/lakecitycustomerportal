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
    const { email, password, fullName, role = "helpdesk", forcePasswordChange = false, sendWelcomeEmail = false } = await req.json();

    // Validate email domain
    if (!email || !email.toLowerCase().endsWith("@lakecity.co.zw")) {
      return new Response(
        JSON.stringify({ error: "Only @lakecity.co.zw emails can be created as internal users" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log(`Creating internal account for: ${email}, forcePasswordChange: ${forcePasswordChange}`);

    // Check if user already exists
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    const isOverrideApprover = ['alex@lakecity.co.zw', 'brenda@lakecity.co.zw', 'tapiwa@lakecity.co.zw'].includes(email.toLowerCase());

    if (existingUser) {
      console.log(`User ${email} already exists, updating role to ${role}`);
      
      // Update password
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { password }
      );

      if (pwError) {
        console.error("Error updating password:", pwError);
      }
      
      // Update internal_users
      const { error: updateError } = await supabaseAdmin
        .from('internal_users')
        .upsert({
          user_id: existingUser.id,
          email: email.toLowerCase(),
          full_name: fullName || null,
          role: role,
          is_override_approver: isOverrideApprover,
          force_password_change: forcePasswordChange,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (updateError) {
        console.error("Error updating internal_users:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update role", details: updateError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `User updated with new password and role ${role}`,
          userId: existingUser.id,
          email: email,
          forcePasswordChange
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
        full_name: fullName
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

    // The auto_provision_internal_user trigger will create the internal_users entry
    // But we need to set the correct role and force_password_change
    const { error: roleError } = await supabaseAdmin
      .from('internal_users')
      .upsert({
        user_id: userId,
        email: email.toLowerCase(),
        full_name: fullName || null,
        role: role,
        is_override_approver: isOverrideApprover,
        force_password_change: forcePasswordChange
      }, { onConflict: 'user_id' });

    if (roleError) {
      console.error("Error setting role:", roleError);
    }

    // Also update profile if needed
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: email.toLowerCase(),
        full_name: fullName || null
      }, { onConflict: 'id' });

    if (profileError) {
      console.error("Error updating profile:", profileError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Internal account created successfully",
        userId: userId,
        email: email,
        role: role,
        forcePasswordChange
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
