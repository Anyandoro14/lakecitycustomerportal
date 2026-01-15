import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    // Verify email domain
    if (!userEmail?.toLowerCase().endsWith('@lakecity.co.zw')) {
      return new Response(
        JSON.stringify({ error: 'Access restricted to LakeCity staff', isInternal: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = await req.json();

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (action === 'check-access') {
      // Check if user exists in internal_users table
      const { data: internalUser, error: userError } = await supabaseAdmin
        .from('internal_users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (userError && userError.code !== 'PGRST116') {
        console.error('Error checking internal user:', userError);
      }

      // If not in internal_users but is @lakecity.co.zw, auto-provision as helpdesk
      if (!internalUser && userEmail.toLowerCase().endsWith('@lakecity.co.zw')) {
        const { data: newUser, error: insertError } = await supabaseAdmin
          .from('internal_users')
          .insert({
            user_id: userId,
            email: userEmail.toLowerCase(),
            full_name: userEmail.split('@')[0],
            role: 'helpdesk',
            is_override_approver: false
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error auto-provisioning internal user:', insertError);
          return new Response(
            JSON.stringify({ error: 'Failed to provision access', isInternal: false }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log the auto-provision
        await supabaseAdmin.from('audit_log').insert({
          action: 'AUTO_PROVISION',
          entity_type: 'internal_user',
          entity_id: newUser.id,
          performed_by: userId,
          performed_by_email: userEmail,
          details: { message: 'Auto-provisioned as helpdesk user' }
        });

        return new Response(
          JSON.stringify({ isInternal: true, user: newUser }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ isInternal: !!internalUser, user: internalUser }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-audit-logs') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: logs, error } = await supabaseAdmin
        .from('audit_log')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching audit logs:', error);
        return new Response(
          JSON.stringify({ logs: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ logs: logs || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'search-customer') {
      const body = await req.clone().json();
      const { searchType, searchQuery } = body;
      
      let query = supabaseAdmin.from('profiles').select('*');
      
      if (searchType === 'stand') {
        query = query.ilike('stand_number', `%${searchQuery}%`);
      } else if (searchType === 'phone') {
        query = query.ilike('phone_number', `%${searchQuery}%`);
      }

      const { data: customers, error } = await query.limit(10);

      if (error) {
        console.error('Error searching customers:', error);
        return new Response(
          JSON.stringify({ customers: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the search
      await supabaseAdmin.from('audit_log').insert({
        action: 'CUSTOMER_SEARCH',
        entity_type: 'customer',
        entity_id: searchQuery,
        performed_by: userId,
        performed_by_email: userEmail,
        details: { searchType, searchQuery, resultsCount: customers?.length || 0 }
      });

      return new Response(
        JSON.stringify({ 
          customers: customers?.map(c => ({
            stand_number: c.stand_number,
            full_name: c.full_name,
            email: c.email,
            phone_number: c.phone_number,
            payment_start_date: c.payment_start_date,
            user_id: c.id
          })) || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== USER MANAGEMENT ====================

    // Helper to check if current user is super_admin
    const checkSuperAdmin = async () => {
      const { data: currentUserData } = await supabaseAdmin
        .from('internal_users')
        .select('role')
        .eq('user_id', userId)
        .single();
      return currentUserData?.role === 'super_admin';
    };

    if (action === 'list-internal-users') {
      // Only super_admin can list all internal users
      const isSuperAdmin = await checkSuperAdmin();
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Only super admins can manage users' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: users, error } = await supabaseAdmin
        .from('internal_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching internal users:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch users' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ users: users || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update-user-role') {
      const isSuperAdmin = await checkSuperAdmin();
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Only super admins can update roles' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.clone().json();
      const { targetUserId, newRole } = body;

      if (!['helpdesk', 'admin', 'super_admin'].includes(newRole)) {
        return new Response(
          JSON.stringify({ error: 'Invalid role' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prevent demoting yourself
      if (targetUserId === userId && newRole !== 'super_admin') {
        return new Response(
          JSON.stringify({ error: 'Cannot demote yourself' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('internal_users')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', targetUserId)
        .select()
        .single();

      if (error) {
        console.error('Error updating user role:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update role' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the action
      await supabaseAdmin.from('audit_log').insert({
        action: 'UPDATE_USER_ROLE',
        entity_type: 'internal_user',
        entity_id: targetUserId,
        performed_by: userId,
        performed_by_email: userEmail,
        details: { targetEmail: updated.email, newRole }
      });

      return new Response(
        JSON.stringify({ success: true, user: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'toggle-override-approver') {
      const isSuperAdmin = await checkSuperAdmin();
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Only super admins can toggle approver status' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.clone().json();
      const { targetUserId, isApprover } = body;

      const { data: updated, error } = await supabaseAdmin
        .from('internal_users')
        .update({ is_override_approver: isApprover, updated_at: new Date().toISOString() })
        .eq('id', targetUserId)
        .select()
        .single();

      if (error) {
        console.error('Error toggling approver status:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update approver status' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the action
      await supabaseAdmin.from('audit_log').insert({
        action: 'TOGGLE_APPROVER',
        entity_type: 'internal_user',
        entity_id: targetUserId,
        performed_by: userId,
        performed_by_email: userEmail,
        details: { targetEmail: updated.email, isApprover }
      });

      return new Response(
        JSON.stringify({ success: true, user: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'revoke-user-access') {
      const isSuperAdmin = await checkSuperAdmin();
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Only super admins can revoke access' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.clone().json();
      const { targetUserId } = body;

      // Prevent revoking your own access
      const { data: targetUser } = await supabaseAdmin
        .from('internal_users')
        .select('user_id, email')
        .eq('id', targetUserId)
        .single();

      if (targetUser?.user_id === userId) {
        return new Response(
          JSON.stringify({ error: 'Cannot revoke your own access' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabaseAdmin
        .from('internal_users')
        .delete()
        .eq('id', targetUserId);

      if (error) {
        console.error('Error revoking user access:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to revoke access' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the action
      await supabaseAdmin.from('audit_log').insert({
        action: 'REVOKE_ACCESS',
        entity_type: 'internal_user',
        entity_id: targetUserId,
        performed_by: userId,
        performed_by_email: userEmail,
        details: { revokedEmail: targetUser?.email }
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Internal portal access error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
