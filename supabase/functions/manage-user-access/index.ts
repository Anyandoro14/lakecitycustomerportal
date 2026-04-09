import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCollectionScheduleSheetTitle } from "../_shared/collection-schedule-sheets.ts";

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

    // Extract tenant_id from JWT app_metadata
    const authHeader = req.headers.get('Authorization');
    let tenantId: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const userToken = authHeader.replace('Bearer ', '');
      const { data: { user: tokenUser } } = await supabaseAdmin.auth.getUser(userToken);
      tenantId = tokenUser?.app_metadata?.tenant_id;
    }

    // Check if user is a Super Admin or Director
    const superAdmins = getSuperAdmins();
    const userEmail = user.email?.toLowerCase() || '';
    const isSuperAdmin = superAdmins.includes(userEmail);
    
    // Check if user is director from internal_users table
    let internalUserQuery = supabaseClient
      .from('internal_users')
      .select('role')
      .eq('user_id', user.id);
    if (tenantId) internalUserQuery = internalUserQuery.eq('tenant_id', tenantId);
    const { data: internalUser } = await internalUserQuery.single();
    
    const isDirector = internalUser?.role === 'director';
    const canAccess = isSuperAdmin || isDirector;
    
    if (!canAccess) {
      throw new Error('Forbidden: Only Super Admins and Directors can access user management');
    }

    const { action, userData, userId } = await req.json();

    if (action === 'fetch') {
      // Fetch all internal users with their account status
      let internalUsersQuery = supabaseAdmin
        .from('internal_users')
        .select('*');
      if (tenantId) internalUsersQuery = internalUsersQuery.eq('tenant_id', tenantId);
      const { data: internalUsers, error: internalError } = await internalUsersQuery
        .order('created_at', { ascending: false });

      if (internalError) {
        console.error('Error fetching internal users:', internalError);
        throw new Error('Failed to fetch internal users');
      }

      // Fetch all profiles to check account creation status
      const userIds = internalUsers?.map(u => u.user_id) || [];
      let profilesQuery = supabaseAdmin
        .from('profiles')
        .select('id, created_at, email, full_name, stand_number')
        .in('id', userIds);
      if (tenantId) profilesQuery = profilesQuery.eq('tenant_id', tenantId);
      const { data: profiles } = await profilesQuery;

      // Get all customers (non-internal users with profiles)
      let allProfilesQuery = supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, stand_number, phone_number, phone_number_2, created_at');
      if (tenantId) allProfilesQuery = allProfilesQuery.eq('tenant_id', tenantId);
      const { data: allProfiles, error: allProfilesError } = await allProfilesQuery
        .order('created_at', { ascending: false });

      if (allProfilesError) {
        console.error('Error fetching all profiles:', allProfilesError);
      }
      console.log(`Fetched ${allProfiles?.length || 0} total profiles`);

      // Get auth users to check account created status - paginate to get all users
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

      // Create profile map for quick lookup
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const authUserMap = new Map(authUsers?.users?.map(u => [u.id, u]) || []);
      console.log(`Auth users map has ${authUserMap.size} entries`);

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
      console.log(`Internal user IDs to exclude: ${Array.from(internalUserIds).join(', ')}`);
      
      const customersList = (allProfiles || [])
        .filter(p => !internalUserIds.has(p.id) && p.email)
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
            phoneNumber: p.phone_number || null,
            phoneNumber2: p.phone_number_2 || null,
          };
        });

      console.log(`Built ${customersList.length} customers`);

      // Return both lists
      console.log(`Returning ${internalUsersList.length} internal users and ${customersList.length} customers`);
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
      let targetUserQuery = supabaseAdmin
        .from('internal_users')
        .select('email')
        .eq('user_id', targetUserId);
      if (tenantId) targetUserQuery = targetUserQuery.eq('tenant_id', tenantId);
      const { data: targetUser } = await targetUserQuery.single();

      if (targetUser && superAdmins.includes(targetUser.email.toLowerCase())) {
        throw new Error('Cannot modify Super Admin roles');
      }

      // Validate role
      const validRoles = ['admin', 'director', 'helpdesk'];
      if (!validRoles.includes(newRole)) {
        throw new Error('Invalid role');
      }

      // Update the role
      let updateRoleQuery = supabaseAdmin
        .from('internal_users')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('user_id', targetUserId);
      if (tenantId) updateRoleQuery = updateRoleQuery.eq('tenant_id', tenantId);
      const { error: updateError } = await updateRoleQuery;

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
          details: { newRole, previousEmail: targetUser?.email },
          ...(tenantId ? { tenant_id: tenantId } : {})
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
      let existingUserQuery = supabaseAdmin
        .from('internal_users')
        .select('id')
        .eq('email', email.toLowerCase());
      if (tenantId) existingUserQuery = existingUserQuery.eq('tenant_id', tenantId);
      const { data: existingUser } = await existingUserQuery.single();

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
    } else if (action === 'updatePhoneNumber') {
      // Only Super Admins can update phone numbers
      if (!isSuperAdmin) {
        throw new Error('Forbidden: Only Super Admins can update customer phone numbers');
      }

      const { userId: targetUserId, newPhoneNumber } = userData;
      
      if (!targetUserId || !newPhoneNumber) {
        throw new Error('User ID and new phone number are required');
      }

      // Validate phone number format (basic validation)
      const phoneRegex = /^\+?[1-9]\d{6,14}$/;
      const cleanedPhone = newPhoneNumber.replace(/\s/g, '');
      if (!phoneRegex.test(cleanedPhone)) {
        throw new Error('Invalid phone number format. Please use international format (e.g., +18452757810)');
      }

      // Get current profile info
      const { data: currentProfile } = await supabaseAdmin
        .from('profiles')
        .select('email, stand_number, phone_number, payment_plan_months')
        .eq('id', targetUserId)
        .single();

      if (!currentProfile) {
        throw new Error('Customer profile not found');
      }

      if (!currentProfile.stand_number) {
        throw new Error('Customer does not have a stand number assigned');
      }

      // CRITICAL: Validate against Google Sheet - the Collection Schedule is the authoritative source
      const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
      const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
      const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

      if (!spreadsheetId || !clientEmail || !privateKey) {
        throw new Error('Google Sheets configuration is missing');
      }

      // Get Google access token - handle both JSON and raw private key formats
      const getAccessToken = async () => {
        const header = { alg: 'RS256', typ: 'JWT' };
        const now = Math.floor(Date.now() / 1000);
        const claim = {
          iss: clientEmail,
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now
        };

        const encoder = new TextEncoder();
        const toBase64Url = (data: Uint8Array) => btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        const headerB64 = toBase64Url(encoder.encode(JSON.stringify(header)));
        const claimB64 = toBase64Url(encoder.encode(JSON.stringify(claim)));
        const signatureInput = `${headerB64}.${claimB64}`;

        // Handle both raw private key and JSON service account key formats
        let actualPrivateKey: string;
        if (privateKey.trim().startsWith('{')) {
          try {
            const keyData = JSON.parse(privateKey);
            actualPrivateKey = keyData.private_key;
          } catch (e) {
            console.error('Error parsing JSON service account key');
            throw new Error('Invalid JSON service account key format');
          }
        } else {
          actualPrivateKey = privateKey;
          if (!actualPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
            actualPrivateKey = `-----BEGIN PRIVATE KEY-----\n${actualPrivateKey}\n-----END PRIVATE KEY-----`;
          }
        }
        
        // Replace escaped newlines with actual newlines
        actualPrivateKey = actualPrivateKey.replace(/\\n/g, '\n');

        const pemHeader = '-----BEGIN PRIVATE KEY-----';
        const pemFooter = '-----END PRIVATE KEY-----';
        
        let pemContents = actualPrivateKey;
        if (pemContents.includes(pemHeader)) {
          pemContents = pemContents.substring(
            pemContents.indexOf(pemHeader) + pemHeader.length,
            pemContents.indexOf(pemFooter)
          );
        }
        
        // Remove all whitespace and non-base64 characters
        pemContents = pemContents.replace(/[^A-Za-z0-9+/=]/g, '');
        
        let binaryKey: Uint8Array;
        try {
          const binaryString = atob(pemContents);
          binaryKey = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            binaryKey[i] = binaryString.charCodeAt(i);
          }
        } catch (e) {
          console.error('Failed to decode base64 private key');
          throw new Error('Failed to decode private key - invalid base64 encoding');
        }
        
        const cryptoKey = await crypto.subtle.importKey(
          'pkcs8',
          binaryKey.buffer as ArrayBuffer,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['sign']
        );

        const signature = await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          cryptoKey,
          encoder.encode(signatureInput)
        );

        const jwt = `${signatureInput}.${toBase64Url(new Uint8Array(signature))}`;

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
        });

        const tokenData = await tokenResponse.json();
        return tokenData.access_token;
      };

      const accessToken = await getAccessToken();

      const metadataUrl0 = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const metadataRes0 = await fetch(metadataUrl0, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!metadataRes0.ok) {
        throw new Error('Failed to load spreadsheet metadata for phone validation');
      }
      const meta0 = await metadataRes0.json();
      const sheetList = meta0.sheets || [];

      const planMonths =
        currentProfile.payment_plan_months != null && currentProfile.payment_plan_months > 0
          ? Math.round(Number(currentProfile.payment_plan_months))
          : null;

      const resolved = resolveCollectionScheduleSheetTitle(sheetList, {
        paymentPlanMonths: planMonths,
        envPreferredName: Deno.env.get('SHEET_NAME'),
        envPreferredGid: Deno.env.get('SHEET_GID'),
      });
      const sheetName = resolved.sheetTitle;
      const sheetOk = sheetList.some((s: { properties?: { title?: string } }) => s.properties?.title === sheetName);
      if (!sheetOk) {
        throw new Error(
          `Collection Schedule tab "${sheetName}" not found. Set profiles.payment_plan_months or rename the sheet.`,
        );
      }

      // Fetch the Collection Schedule to find the stand's authoritative phone number
      const range = `'${sheetName.replace(/'/g, "''")}'!A:BL`;
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
      
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text();
        console.error('Google Sheets API error:', errorText);
        throw new Error('Failed to fetch Collection Schedule data for validation');
      }

      const sheetsData = await sheetsResponse.json();
      const rows = sheetsData.values || [];

      if (rows.length < 2) {
        throw new Error('Collection Schedule is empty or missing headers');
      }

      // Find column indices from header row
      const headerRow = rows[0].map((h: string) => h?.toString().toLowerCase().trim() || '');
      const standIndex = headerRow.findIndex((h: string) => h === 'stand number' || h === 'stand' || h === 'stand no');
      const phoneIndex = headerRow.findIndex((h: string) => h === 'phone number' || h === 'phone' || h === 'contact number' || h === 'contact' || h === 'tel');

      if (standIndex === -1) {
        throw new Error('Stand Number column not found in Collection Schedule');
      }

      if (phoneIndex === -1) {
        throw new Error('Phone Number column not found in Collection Schedule');
      }

      // Find the customer's row by stand number
      let sheetPhoneNumber: string | null = null;
      const normalizeStand = (s: string) => s?.toString().replace(/\s+/g, '').toLowerCase() || '';
      const targetStand = normalizeStand(currentProfile.stand_number);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowStand = normalizeStand(row[standIndex] || '');
        
        if (rowStand === targetStand) {
          sheetPhoneNumber = row[phoneIndex]?.toString().trim() || null;
          break;
        }
      }

      if (!sheetPhoneNumber) {
        throw new Error(`Stand ${currentProfile.stand_number} not found in Collection Schedule, or phone number is empty. Please update the Collection Schedule first.`);
      }

      // Normalize phone numbers for comparison
      const normalizePhone = (phone: string): string => {
        return phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
      };

      const normalizedSheetPhone = normalizePhone(sheetPhoneNumber);
      const normalizedNewPhone = normalizePhone(cleanedPhone);

      // STRICT MATCH: The new phone number must match exactly what's in the Collection Schedule
      if (normalizedSheetPhone !== normalizedNewPhone) {
        console.log(`Phone mismatch for stand ${currentProfile.stand_number}: Sheet has "${sheetPhoneNumber}" (normalized: ${normalizedSheetPhone}), user entered "${newPhoneNumber}" (normalized: ${normalizedNewPhone})`);
        
        return new Response(
          JSON.stringify({ 
            error: 'Phone number does not match Collection Schedule',
            validationError: true,
            message: `The phone number must match exactly what is in the Collection Schedule.`,
            details: {
              standNumber: currentProfile.stand_number,
              sheetPhoneNumber: sheetPhoneNumber,
              enteredPhoneNumber: newPhoneNumber.trim(),
              instruction: 'Please update the Collection Schedule first, then enter the same number here.'
            }
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Phone matches the sheet - proceed with update
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ 
          phone_number: normalizedSheetPhone, // Use the normalized sheet phone for consistency
          updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);

      if (updateError) {
        console.error('Error updating phone number:', updateError);
        throw new Error('Failed to update phone number');
      }

      // Log the action
      await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'phone_number_updated',
          entity_type: 'customer',
          entity_id: targetUserId,
          performed_by: user.id,
          performed_by_email: user.email,
          details: { 
            standNumber: currentProfile.stand_number,
            email: currentProfile.email,
            previousPhoneNumber: currentProfile.phone_number,
            newPhoneNumber: normalizedSheetPhone,
            sheetPhoneNumber: sheetPhoneNumber,
            validatedAgainstSheet: true
          }
        });

      console.log(`Phone number updated for stand ${currentProfile.stand_number}: ${currentProfile.phone_number} -> ${normalizedSheetPhone} (validated against sheet)`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Phone number updated successfully',
          details: {
            standNumber: currentProfile.stand_number,
            newPhoneNumber: normalizedSheetPhone
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'updatePhoneNumber2') {
      // Only Super Admins can update secondary phone numbers
      if (!isSuperAdmin) {
        throw new Error('Forbidden: Only Super Admins can update customer phone numbers');
      }

      const { userId: targetUserId, newPhoneNumber2 } = userData;
      
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      // Get current profile info
      const { data: currentProfile } = await supabaseAdmin
        .from('profiles')
        .select('email, stand_number, phone_number_2')
        .eq('id', targetUserId)
        .single();

      if (!currentProfile) {
        throw new Error('Customer profile not found');
      }

      // Secondary phone doesn't require sheet validation - it's a convenience number
      // Just validate format if provided
      let normalizedPhone2: string | null = null;
      if (newPhoneNumber2 && newPhoneNumber2.trim()) {
        const phoneRegex = /^\+?[1-9]\d{6,14}$/;
        const cleanedPhone = newPhoneNumber2.replace(/\s/g, '');
        if (!phoneRegex.test(cleanedPhone)) {
          throw new Error('Invalid phone number format. Please use international format (e.g., +18452757810)');
        }
        normalizedPhone2 = cleanedPhone;
      }

      // Update the secondary phone number
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ 
          phone_number_2: normalizedPhone2,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);

      if (updateError) {
        console.error('Error updating secondary phone number:', updateError);
        throw new Error('Failed to update secondary phone number');
      }

      // Log the action
      await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'secondary_phone_number_updated',
          entity_type: 'customer',
          entity_id: targetUserId,
          performed_by: user.id,
          performed_by_email: user.email,
          details: { 
            standNumber: currentProfile.stand_number,
            email: currentProfile.email,
            previousPhoneNumber2: currentProfile.phone_number_2,
            newPhoneNumber2: normalizedPhone2
          }
        });

      console.log(`Secondary phone number updated for stand ${currentProfile.stand_number}: ${currentProfile.phone_number_2} -> ${normalizedPhone2}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Secondary phone number updated successfully',
          details: {
            standNumber: currentProfile.stand_number,
            newPhoneNumber2: normalizedPhone2
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'deleteCustomer') {
      // Only Super Admins can delete customers
      if (!isSuperAdmin) {
        throw new Error('Forbidden: Only Super Admins can delete customers');
      }

      const targetUserId = userId;
      if (!targetUserId) {
        throw new Error('User ID is required');
      }

      // Prevent deleting internal users through this action
      const { data: internalCheck } = await supabaseAdmin
        .from('internal_users')
        .select('id')
        .eq('user_id', targetUserId)
        .single();

      if (internalCheck) {
        throw new Error('Cannot delete internal users through this action');
      }

      // Get customer info for audit log
      const { data: customerProfile } = await supabaseAdmin
        .from('profiles')
        .select('email, stand_number, full_name')
        .eq('id', targetUserId)
        .single();

      // Delete bypass codes for this user's stand
      if (customerProfile?.stand_number) {
        await supabaseAdmin
          .from('twofa_bypass_codes')
          .delete()
          .eq('stand_number', customerProfile.stand_number);
      }

      // Delete the profile (this should cascade or be handled)
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', targetUserId);

      // Delete the auth user
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

      if (deleteAuthError) {
        console.error('Error deleting auth user:', deleteAuthError);
        throw new Error('Failed to delete user account');
      }

      // Log the action
      await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'customer_deleted',
          entity_type: 'customer',
          entity_id: targetUserId,
          performed_by: user.id,
          performed_by_email: user.email,
          details: { 
            email: customerProfile?.email,
            standNumber: customerProfile?.stand_number,
            fullName: customerProfile?.full_name
          }
        });

      return new Response(
        JSON.stringify({ success: true, message: 'Customer account deleted successfully' }),
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
