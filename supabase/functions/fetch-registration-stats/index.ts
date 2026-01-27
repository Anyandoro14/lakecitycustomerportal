import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate Google OAuth access token
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
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
    // Verify authorization
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

    // Check if user is internal staff
    const { data: internalUser } = await supabaseClient
      .from('internal_users')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!internalUser || !['director', 'super_admin'].includes(internalUser.role)) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching registration statistics...');

    const accessToken = await getGoogleAccessToken();
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    
    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID not configured');
    }

    // Get spreadsheet metadata
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metadataResponse.ok) {
      throw new Error('Failed to fetch spreadsheet metadata');
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];
    const sheetTitle = sheets.length > 0 ? sheets[0].properties.title : 'Sheet1';

    // Fetch columns B (Stand), C (First Name), D (Last Name), F (Category), and BK (Registered)
    const range = encodeURIComponent(`${sheetTitle}!A:BK`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch spreadsheet data');
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      return new Response(
        JSON.stringify({
          totalCustomers: 0,
          registeredCustomers: 0,
          unregisteredCustomers: 0,
          registrationPercentage: 0,
          byCategory: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Column indices (0-based)
    const STAND_COL = 1;       // Column B - Stand Number
    const FIRST_NAME_COL = 2;  // Column C - First Name
    const LAST_NAME_COL = 3;   // Column D - Last Name
    const CATEGORY_COL = 5;    // Column F - Customer Category
    const REGISTERED_COL = 62; // Column BK (0-based: A=0, B=1, ..., BK=62)

    interface CustomerRecord {
      standNumber: string;
      customerName: string;
      category: string;
      isRegistered: boolean;
    }

    const customers: CustomerRecord[] = [];
    const categoryStats: { [key: string]: { total: number; registered: number } } = {};

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const standNumber = row[STAND_COL]?.toString().trim() || '';
      const firstName = row[FIRST_NAME_COL]?.toString().trim() || '';
      const lastName = row[LAST_NAME_COL]?.toString().trim() || '';
      const category = row[CATEGORY_COL]?.toString().trim() || 'Uncategorized';
      const registeredValue = row[REGISTERED_COL]?.toString().trim().toUpperCase() || '';
      
      // Skip rows without stand numbers (unsold/empty)
      if (!standNumber) continue;
      
      // Skip rows that look like headers or totals
      if (standNumber.toLowerCase().includes('stand') || standNumber.toLowerCase().includes('total')) continue;

      const isRegistered = registeredValue === 'TRUE' || registeredValue === 'YES' || registeredValue === '1';
      const customerName = `${firstName} ${lastName}`.trim() || 'Unknown';

      customers.push({
        standNumber,
        customerName,
        category,
        isRegistered
      });

      // Track by category
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, registered: 0 };
      }
      categoryStats[category].total++;
      if (isRegistered) {
        categoryStats[category].registered++;
      }
    }

    const totalCustomers = customers.length;
    const registeredCustomers = customers.filter(c => c.isRegistered).length;
    const unregisteredCustomers = totalCustomers - registeredCustomers;
    const registrationPercentage = totalCustomers > 0 
      ? parseFloat(((registeredCustomers / totalCustomers) * 100).toFixed(2))
      : 0;

    // Format category stats
    const byCategory = Object.entries(categoryStats).map(([category, stats]) => ({
      category,
      total: stats.total,
      registered: stats.registered,
      unregistered: stats.total - stats.registered,
      percentage: stats.total > 0 
        ? parseFloat(((stats.registered / stats.total) * 100).toFixed(2))
        : 0
    })).sort((a, b) => b.total - a.total);

    // Get unregistered customers list for potential outreach
    const unregisteredList = customers
      .filter(c => !c.isRegistered)
      .map(c => ({
        standNumber: c.standNumber,
        customerName: c.customerName,
        category: c.category
      }));

    console.log(`Registration stats: ${registeredCustomers}/${totalCustomers} (${registrationPercentage}%)`);

    return new Response(
      JSON.stringify({
        totalCustomers,
        registeredCustomers,
        unregisteredCustomers,
        registrationPercentage,
        byCategory,
        unregisteredList
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching registration stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch registration statistics' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
