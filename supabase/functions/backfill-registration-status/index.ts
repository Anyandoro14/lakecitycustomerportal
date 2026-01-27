import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate Google OAuth access token with write scope
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

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  
  const base64url = (str: string) => {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };
  
  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
  
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

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signatureInput)
  );

  const signature = base64url(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  const jwt = `${signatureInput}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get access token');
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization - only super_admin/director can run this
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(userToken);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is internal staff with proper role
    const { data: internalUser } = await supabaseClient
      .from('internal_users')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!internalUser || !['director', 'super_admin'].includes(internalUser.role)) {
      return new Response(
        JSON.stringify({ error: 'Access denied - requires Director or Super Admin role' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting backfill of Column BK for registered customers...');

    // Get all registered customers from profiles table
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('stand_number, email')
      .not('stand_number', 'is', null);

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No registered customers found', updated: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${profiles.length} registered customers to process`);

    // Get Google Sheets access
    const accessToken = await getGoogleAccessToken();
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    
    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID not configured');
    }

    // Determine which sheet to use (same as fetch-reporting-data)
    const sheetName = Deno.env.get('SHEET_NAME') || 'Collection Schedule 1';
    console.log(`Using sheet: "${sheetName}"`);

    // Fetch header row and first few columns to find stand numbers
    const range = encodeURIComponent(`${sheetName}!A1:BK`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet data: ${response.status}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      throw new Error('No data found in sheet');
    }

    // Find stand number column by header
    const headerRow = rows[0];
    let standNumberIdx = headerRow.findIndex((h: string) => h?.toLowerCase().includes('stand number'));
    
    // Fallback to column B if not found by header
    if (standNumberIdx === -1) {
      standNumberIdx = 1; // Column B
      console.log('Stand number column not found by header, defaulting to column B');
    } else {
      console.log(`Found stand number column at index ${standNumberIdx}`);
    }

    // Build stand number to row index mapping
    const standToRow: Map<string, number> = new Map();
    for (let i = 1; i < rows.length; i++) {
      const stand = rows[i]?.[standNumberIdx]?.toString().trim().toUpperCase();
      if (stand && !stand.toLowerCase().includes('stand') && !stand.toLowerCase().includes('total')) {
        standToRow.set(stand, i + 1); // Sheets are 1-indexed
      }
    }

    console.log(`Mapped ${standToRow.size} stands from spreadsheet`);
    
    // Log first few stand numbers for debugging
    const sampleStands = Array.from(standToRow.keys()).slice(0, 10);
    console.log(`Sample stands from sheet: ${sampleStands.join(', ')}`);
    
    // Log first few profile stand numbers for debugging
    const profileStands = profiles.slice(0, 10).map(p => p.stand_number?.trim().toUpperCase());
    console.log(`Sample profile stands: ${profileStands.join(', ')}`);

    // Prepare batch update requests
    const updateData: { range: string; values: string[][] }[] = [];
    let matchedCount = 0;
    let skippedCount = 0;

    for (const profile of profiles) {
      if (!profile.stand_number) {
        skippedCount++;
        continue;
      }

      const normalizedStand = profile.stand_number.trim().toUpperCase();
      const rowIndex = standToRow.get(normalizedStand);

      if (rowIndex) {
        updateData.push({
          range: `${sheetName}!BK${rowIndex}`,
          values: [["TRUE"]]
        });
        matchedCount++;
        console.log(`Queued update for stand ${normalizedStand} at row ${rowIndex}`);
      } else {
        console.log(`Stand ${normalizedStand} not found in spreadsheet`);
        skippedCount++;
      }
    }

    if (updateData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No matching stands found to update',
          processed: profiles.length,
          matched: 0,
          skipped: skippedCount
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Batch update using batchUpdate API
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    
    const batchResponse = await fetch(batchUpdateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updateData
      })
    });

    if (!batchResponse.ok) {
      const errorText = await batchResponse.text();
      console.error('Batch update failed:', errorText);
      throw new Error(`Batch update failed: ${errorText}`);
    }

    const batchResult = await batchResponse.json();
    console.log(`Batch update completed: ${batchResult.totalUpdatedCells} cells updated`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully updated Column BK for ${matchedCount} registered customers`,
        processed: profiles.length,
        updated: matchedCount,
        skipped: skippedCount,
        cellsUpdated: batchResult.totalUpdatedCells
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to backfill registration status';
    console.error('Error in backfill-registration-status:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
