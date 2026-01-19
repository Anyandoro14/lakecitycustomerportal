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

interface GoogleSheetsResponse {
  values?: string[][];
}

// Retry helper with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status < 500) {
        return response;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`API call failed with ${response.status}, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`API call failed, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const userEmail = user.email?.toLowerCase() || '';
    console.log(`Checking access for user`);

    // Check if user is a Super Admin
    const superAdmins = getSuperAdmins();
    const isSuperAdmin = superAdmins.includes(userEmail);

    // Check if user is a Director (directors have access to reporting)
    const directorEmails = ['alex@lakecity.co.zw', 'brenda@lakecity.co.zw', 'tapiwa@lakecity.co.zw'];
    const isDirector = directorEmails.includes(userEmail);

    // If Super Admin or Director, grant access immediately
    if (isSuperAdmin || isDirector) {
      return new Response(
        JSON.stringify({
          hasAccess: true,
          isSuperAdmin,
          isDirector,
          role: isSuperAdmin ? 'Super Admin' : 'Director'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create JWT for Google Sheets API
    const serviceAccountEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const serviceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    const accessSheetId = Deno.env.get('SPREADSHEET_ID');

    if (!serviceAccountEmail || !serviceAccountKey || !accessSheetId) {
      throw new Error('Missing Google Sheets configuration');
    }

    // Handle both raw private key and JSON service account key formats
    let privateKey: string;
    if (serviceAccountKey.trim().startsWith('{')) {
      try {
        const keyData = JSON.parse(serviceAccountKey);
        privateKey = keyData.private_key;
      } catch (e) {
        console.error('Error parsing JSON service account key');
        throw new Error('Invalid JSON service account key format');
      }
    } else {
      privateKey = serviceAccountKey;
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }
    }
    
    privateKey = privateKey.replace(/\\n/g, '\n');

    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    
    let pemContents = privateKey;
    if (pemContents.includes(pemHeader)) {
      pemContents = pemContents
        .substring(
          pemContents.indexOf(pemHeader) + pemHeader.length,
          pemContents.indexOf(pemFooter)
        );
    }
    
    pemContents = pemContents.replace(/[^A-Za-z0-9+/=]/g, '');
    
    let binaryDer: Uint8Array;
    try {
      const binaryString = atob(pemContents);
      binaryDer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        binaryDer[i] = binaryString.charCodeAt(i);
      }
    } catch (e) {
      console.error('Failed to decode base64 private key');
      throw new Error('Failed to decode private key - invalid base64 encoding');
    }

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const encoder = new TextEncoder();
    const headerBase64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadBase64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const unsignedToken = `${headerBase64}.${payloadBase64}`;

    const key = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer.buffer as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      encoder.encode(unsignedToken)
    );

    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${unsignedToken}.${signatureBase64}`;

    const tokenResponse = await fetchWithRetry('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get access token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const sheetName = 'User Access Control';
    const range = `${sheetName}!A1:D100`;
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${accessSheetId}/values/${encodeURIComponent(range)}`;

    const sheetsResponse = await fetchWithRetry(sheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!sheetsResponse.ok) {
      throw new Error(`Failed to fetch sheet data: ${sheetsResponse.status}`);
    }

    const sheetsData: GoogleSheetsResponse = await sheetsResponse.json();
    const rows = sheetsData.values || [];

    console.log(`Fetched ${rows.length} access control rows`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          hasAccess: isSuperAdmin,
          isSuperAdmin,
          role: isSuperAdmin ? 'Super Admin' : 'None'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headerRow = rows[0];
    const emailIdx = headerRow.findIndex(h => h?.toLowerCase().includes('email'));
    const roleIdx = headerRow.findIndex(h => h?.toLowerCase().includes('role'));
    const accessIdx = headerRow.findIndex(h => h?.toLowerCase().includes('access'));

    let userAccess = false;
    let userRole = 'None';

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const email = row[emailIdx]?.toLowerCase() || '';
      if (email === userEmail) {
        userRole = row[roleIdx] || 'Viewer';
        const accessValue = row[accessIdx]?.toLowerCase() || '';
        userAccess = accessValue === 'yes' || accessValue === 'true' || accessValue === '1';
        break;
      }
    }

    const hasAccess = isSuperAdmin || isDirector || userAccess;

    return new Response(
      JSON.stringify({
        hasAccess,
        isSuperAdmin,
        isDirector,
        role: isSuperAdmin ? 'Super Admin' : (isDirector ? 'Director' : userRole)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking access:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Access check failed', hasAccess: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
