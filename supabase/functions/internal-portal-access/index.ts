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
      const { searchType, searchQuery } = await req.json().catch(() => ({}));
      
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
