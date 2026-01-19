import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get super admins from environment variable
const getSuperAdmins = (): string[] => {
  const superAdminEmails = Deno.env.get('SUPER_ADMIN_EMAILS') || '';
  return superAdminEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is a Super Admin or Director
    const superAdmins = getSuperAdmins();
    const userEmail = user.email?.toLowerCase() || '';
    const isSuperAdmin = superAdmins.includes(userEmail);
    
    // Check if user is director from internal_users table
    const { data: internalUser } = await supabaseClient
      .from('internal_users')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    const isDirector = internalUser?.role === 'director';
    const canAccess = isSuperAdmin || isDirector;
    
    if (!canAccess) {
      throw new Error('Forbidden: Only Super Admins and Directors can access user management');
    }

    const { action, userData, userId } = await req.json();

    if (action === 'fetch') {
      // Fetch all internal users with their account status
      const { data: internalUsers, error: internalError } = await supabaseAdmin
        .from('internal_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (internalError) {
        console.error('Error fetching internal users:', internalError);
        throw new Error('Failed to fetch internal users');
      }

      // Fetch all profiles to check account creation status
      const userIds = internalUsers?.map(u => u.user_id) || [];
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, created_at, email, full_name, stand_number')
        .in('id', userIds);

      // Get all customers (non-internal users with profiles)
      const { data: allProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, stand_number, created_at')
        .order('created_at', { ascending: false });

      // Get auth users to check account created status
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();

      // Create profile map for quick lookup
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const authUserMap = new Map(authUsers?.users?.map(u => [u.id, u]) || []);

      // Get password reset tokens for last reset date
      const { data: resetTokens } = await supabaseAdmin
        .from('password_reset_tokens')
        .select('user_id, created_at')
        .order('created_at', { ascending: false });

      const lastResetMap = new Map<string, string>();
      resetTokens?.forEach(token => {
        if (!lastResetMap.has(token.user_id)) {
          lastResetMap.set(token.user_id, token.created_at);
        }
      });

      // Build comprehensive user list for internal users
      const internalUsersList = (internalUsers || []).map(iu => {
        const profile = profileMap.get(iu.user_id);
        const authUser = authUserMap.get(iu.user_id);
        const lastReset = lastResetMap.get(iu.user_id);
        
        // Determine account type based on role
        let accountType = 'Staff – Admin';
        if (superAdmins.includes(iu.email.toLowerCase())) {
          accountType = 'Super Admin';
        } else if (iu.role === 'director') {
          accountType = 'Staff – Director';
        } else if (iu.role === 'admin' || iu.role === 'helpdesk') {
          accountType = 'Staff – Admin';
        }

        // Determine access to reporting based on role
        const hasReportingAccess = ['super_admin', 'director'].includes(iu.role) || 
          superAdmins.includes(iu.email.toLowerCase());

        return {
          id: iu.id,
          userId: iu.user_id,
          email: iu.email,
          fullName: iu.full_name || profile?.full_name || '',
          accountType,
          role: iu.role,
          accountCreated: !!authUser,
          accountCreatedDate: authUser?.created_at || null,
          lastPasswordReset: lastReset || null,
          hasReportingAccess,
          isOverrideApprover: iu.is_override_approver,
          forcePasswordChange: iu.force_password_change,
          isSuperAdmin: superAdmins.includes(iu.email.toLowerCase()),
          createdAt: iu.created_at,
          isInternal: true,
        };
      });

      // Build customer list from profiles (excluding internal users)
      const internalUserIds = new Set(internalUsers?.map(u => u.user_id) || []);
      const customersList = (allProfiles || [])
        .filter(p => !internalUserIds.has(p.id) && p.email)
        .map(p => {
          const authUser = authUserMap.get(p.id);
          const lastReset = lastResetMap.get(p.id);

          return {
            id: p.id,
            userId: p.id,
            email: p.email || '',
            fullName: p.full_name || '',
            accountType: 'Customer',
            role: 'customer',
            accountCreated: !!authUser,
            accountCreatedDate: authUser?.created_at || null,
            lastPasswordReset: lastReset || null,
            hasReportingAccess: false,
            isOverrideApprover: false,
            forcePasswordChange: false,
            isSuperAdmin: false,
            createdAt: p.created_at,
            isInternal: false,
            standNumber: p.stand_number,
          };
        });

      // Return both lists
      return new Response(
        JSON.stringify({ 
          users: [...internalUsersList, ...customersList],
          currentUserIsSuperAdmin: isSuperAdmin,
          currentUserIsDirector: isDirector,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'updateRole') {
      // Only Super Admins can update roles
      if (!isSuperAdmin) {
        throw new Error('Forbidden: Only Super Admins can update user roles');
      }

      const { userId: targetUserId, newRole } = userData;

      // Prevent modifying other super admins
      const { data: targetUser } = await supabaseAdmin
        .from('internal_users')
        .select('email')
        .eq('user_id', targetUserId)
        .single();

      if (targetUser && superAdmins.includes(targetUser.email.toLowerCase())) {
        throw new Error('Cannot modify Super Admin roles');
      }

      // Validate role
      const validRoles = ['admin', 'director', 'helpdesk'];
      if (!validRoles.includes(newRole)) {
        throw new Error('Invalid role');
      }

      // Update the role
      const { error: updateError } = await supabaseAdmin
        .from('internal_users')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('user_id', targetUserId);

      if (updateError) {
        console.error('Error updating role:', updateError);
        throw new Error('Failed to update role');
      }

      // Log the action
      await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'role_change',
          entity_type: 'internal_user',
          entity_id: targetUserId,
          performed_by: user.id,
          performed_by_email: user.email,
          details: { newRole, previousEmail: targetUser?.email }
        });

      return new Response(
        JSON.stringify({ success: true, message: 'Role updated successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'addInternalUser') {
      // Only Super Admins can add internal users
      if (!isSuperAdmin) {
        throw new Error('Forbidden: Only Super Admins can add internal users');
      }

      const { email, fullName, role } = userData;

      // Validate email domain
      if (!email.toLowerCase().endsWith('@lakecity.co.zw')) {
        throw new Error('Only @lakecity.co.zw email addresses can be added as internal users');
      }

      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin
        .from('internal_users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (existingUser) {
        throw new Error('User already exists in the system');
      }

      // Create auth user first
      const { data: newAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        throw new Error('Failed to create user account');
      }

      // Insert into internal_users
      const { error: insertError } = await supabaseAdmin
        .from('internal_users')
        .insert({
          user_id: newAuthUser.user.id,
          email: email.toLowerCase(),
          full_name: fullName,
          role: role || 'admin',
          force_password_change: true,
          created_by: user.id
        });

      if (insertError) {
        console.error('Error inserting internal user:', insertError);
        throw new Error('Failed to add internal user');
      }

      // Log the action
      await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'user_created',
          entity_type: 'internal_user',
          entity_id: newAuthUser.user.id,
          performed_by: user.id,
          performed_by_email: user.email,
          details: { email, fullName, role }
        });

      return new Response(
        JSON.stringify({ success: true, message: 'Internal user added successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error managing user access:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'User access management failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
