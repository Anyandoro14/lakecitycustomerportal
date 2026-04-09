import { createClient } from 'npm:@supabase/supabase-js@2';
import { listCollectionScheduleDataTabTitles } from '../_shared/collection-schedule-sheets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper functions for JWT signing (for Google Sheets API)
const base64url = (str: string) => {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const extractPemBase64 = (pem: string) => {
  const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
  const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
  const body = match ? match[1] : normalized;
  let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  else if (pad === 1) throw new Error('Invalid base64 length');
  return base64;
};

// Helper function to get Google Sheets access token
async function getGoogleAccessToken(): Promise<string> {
  const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
  
  let privateKeyPem: string;
  let serviceAccountEmail: string;
  
  try {
    const credentials = JSON.parse(keyString.replace(/\\n/g, '\n'));
    privateKeyPem = credentials.private_key;
    serviceAccountEmail = credentials.client_email;
  } catch {
    privateKeyPem = keyString;
    serviceAccountEmail = clientEmail;
  }

  if (!serviceAccountEmail || !privateKeyPem) {
    throw new Error('Google service account not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

  const base64Key = extractPemBase64(privateKeyPem);
  const raw = atob(base64Key);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(signatureInput)
  );

  const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get Google access token');
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

// Helper function to search Google Sheets for customer data
async function searchGoogleSheets(searchType: string, searchQuery: string): Promise<any[]> {
  const accessToken = await getGoogleAccessToken();
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured');
  }

  // Fetch spreadsheet metadata
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) {
    throw new Error('Failed to fetch spreadsheet metadata');
  }

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  const tabTitles = listCollectionScheduleDataTabTitles(sheets);
  const titlesToScan = tabTitles.length > 0 ? tabTitles : [sheets[0]?.properties?.title || 'Sheet1'];

  const results: any[] = [];
  const normalizedQuery = searchQuery.replace(/\s+/g, '').toLowerCase();

  for (const sheetTitle of titlesToScan) {
    if (results.length >= 10) break;

    const range = encodeURIComponent(`${sheetTitle}!A:AZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) continue;

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) continue;

    const headers = rows[0];
    const standNumIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('stand'));
    const firstNameIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('first name'));
    const lastNameIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('last name'));
    const phoneIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('contact'));
    const emailIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('email'));
    const customerCategoryIndex = 5; // Column F (0-indexed = 5) - Customer Category

    for (let i = 1; i < rows.length; i++) {
      if (results.length >= 10) break;

      const row = rows[i];
      const standNumber = row[standNumIndex]?.toString().trim() || '';
      const phone = row[phoneIndex]?.toString().replace(/\s+/g, '') || '';
      const email = row[emailIndex]?.toString().trim().toLowerCase() || '';
      const firstName = row[firstNameIndex]?.toString().trim() || '';
      const lastName = row[lastNameIndex]?.toString().trim() || '';
      const customerCategory = row[customerCategoryIndex]?.toString().trim() || '';

      let matches = false;

      if (searchType === 'stand') {
        matches = standNumber.toLowerCase().includes(normalizedQuery);
      } else if (searchType === 'phone') {
        const normalizedPhone = phone.replace(/\s+/g, '');
        const normalizedSearchPhone = normalizedQuery;

        if (normalizedPhone.includes(normalizedSearchPhone)) {
          matches = true;
        } else if (normalizedSearchPhone.startsWith('+263') && normalizedPhone.startsWith('0')) {
          const withoutPrefix = normalizedSearchPhone.slice(4);
          matches = normalizedPhone.slice(1).includes(withoutPrefix);
        } else if (normalizedSearchPhone.startsWith('0') && normalizedPhone.startsWith('+263')) {
          const withoutPrefix = normalizedSearchPhone.slice(1);
          matches = normalizedPhone.slice(4).includes(withoutPrefix);
        }
      }

      if (matches) {
        results.push({
          stand_number: standNumber,
          full_name: `${firstName} ${lastName}`.trim() || null,
          email: email || `stand-${standNumber}@lakecity.portal`,
          phone_number: phone || null,
          customer_category: customerCategory || null,
          payment_start_date: null,
          user_id: null,
          source: 'google_sheets'
        });
      }
    }
  }

  return results;
}

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError?.message, 'token length:', token.length);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const userEmail = user.email || '';

    // Verify email domain
    if (!userEmail?.toLowerCase().endsWith('@lakecity.co.zw')) {
      return new Response(
        JSON.stringify({ error: 'Access restricted to LakeCity staff', isInternal: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

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
      const { searchType, searchQuery } = body;
      
      console.log(`Searching customers: type=${searchType}, query=${searchQuery}`);
      
      // First, search the profiles table (registered users)
      let query = supabaseAdmin.from('profiles').select('*');
      
      if (searchType === 'stand') {
        query = query.ilike('stand_number', `%${searchQuery}%`);
      } else if (searchType === 'phone') {
        query = query.ilike('phone_number', `%${searchQuery}%`);
      }

      const { data: profileCustomers, error } = await query.limit(10);

      if (error) {
        console.error('Error searching profiles:', error);
      }

      // Map profile results with source indicator
      const profileResults = (profileCustomers || []).map(c => ({
        stand_number: c.stand_number,
        full_name: c.full_name,
        email: c.email,
        phone_number: c.phone_number,
        payment_start_date: c.payment_start_date,
        user_id: c.id,
        source: 'registered'
      }));

      // If we found enough results in profiles, return them
      if (profileResults.length >= 10) {
        await supabaseAdmin.from('audit_log').insert({
          action: 'CUSTOMER_SEARCH',
          entity_type: 'customer',
          entity_id: searchQuery,
          performed_by: userId,
          performed_by_email: userEmail,
          details: { searchType, searchQuery, resultsCount: profileResults.length, source: 'profiles' }
        });

        return new Response(
          JSON.stringify({ customers: profileResults }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also search Google Sheets for customers who haven't registered yet
      let sheetsResults: any[] = [];
      try {
        console.log('Searching Google Sheets for additional results...');
        sheetsResults = await searchGoogleSheets(searchType, searchQuery);
        console.log(`Found ${sheetsResults.length} results from Google Sheets`);
      } catch (sheetsError) {
        console.error('Error searching Google Sheets:', sheetsError);
      }

      // Combine results, preferring profile data over sheets data (by stand_number)
      const profileStandNumbers = new Set(profileResults.map(p => p.stand_number?.toLowerCase()));
      const filteredSheetsResults = sheetsResults.filter(
        s => s.stand_number && !profileStandNumbers.has(s.stand_number.toLowerCase())
      );

      const allResults = [...profileResults, ...filteredSheetsResults].slice(0, 10);

      // Log the search
      await supabaseAdmin.from('audit_log').insert({
        action: 'CUSTOMER_SEARCH',
        entity_type: 'customer',
        entity_id: searchQuery,
        performed_by: userId,
        performed_by_email: userEmail,
        details: { 
          searchType, 
          searchQuery, 
          resultsCount: allResults.length,
          profileResults: profileResults.length,
          sheetsResults: filteredSheetsResults.length
        }
      });

      return new Response(
        JSON.stringify({ customers: allResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== USER MANAGEMENT ====================

    // Helper to check if current user is super_admin or director
    const checkSuperAdminOrDirector = async () => {
      const { data: currentUserData } = await supabaseAdmin
        .from('internal_users')
        .select('role')
        .eq('user_id', userId)
        .single();
      return currentUserData?.role === 'super_admin' || currentUserData?.role === 'director';
    };

    // Helper to check if current user is super_admin only
    const checkSuperAdmin = async () => {
      const { data: currentUserData } = await supabaseAdmin
        .from('internal_users')
        .select('role')
        .eq('user_id', userId)
        .single();
      return currentUserData?.role === 'super_admin';
    };

    if (action === 'list-internal-users') {
      // Only super_admin or director can list all internal users
      const hasAccess = await checkSuperAdminOrDirector();
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: 'Only super admins or directors can manage users' }),
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

      const { targetUserId, newRole } = body;

      if (!['helpdesk', 'admin', 'director', 'super_admin'].includes(newRole)) {
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
