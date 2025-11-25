import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPER_ADMINS = ['alex@michaeltenable.com', 'alex@lakecity.co.zw'];

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
      
      // Don't retry on client errors (4xx) or success (2xx)
      if (response.status < 500) {
        return response;
      }
      
      // Server error (5xx) - retry with backoff
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`API call failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`API call failed: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
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

    // Check if user is a Super Admin
    const isSuperAdmin = SUPER_ADMINS.includes(user.email || '');
    if (!isSuperAdmin) {
      throw new Error('Forbidden: Only Super Admins can manage user access');
    }

    console.log(`Managing user access by: ${user.email}`);

    const { action, users } = await req.json();

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
    // JSON format
    try {
      const keyData = JSON.parse(serviceAccountKey);
      privateKey = keyData.private_key;
    } catch (e) {
      console.error('Error parsing JSON service account key:', e);
      throw new Error('Invalid JSON service account key format');
    }
  } else {
    // Raw private key format - ensure it has proper header/footer
    privateKey = serviceAccountKey;
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
    }
  }
  
  // Ensure newlines are properly formatted
  privateKey = privateKey.replace(/\\n/g, '\n');

  // Convert PEM to DER format for Web Crypto API
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  
    // Extract the base64 content between headers
    let pemContents = privateKey;
    if (pemContents.includes(pemHeader)) {
      pemContents = pemContents
        .substring(
          pemContents.indexOf(pemHeader) + pemHeader.length,
          pemContents.indexOf(pemFooter)
        );
    }
    
    // Keep only valid base64 characters (A-Z, a-z, 0-9, +, /, =)
    pemContents = pemContents.replace(/[^A-Za-z0-9+/=]/g, '');
  
  // Decode base64 to get DER format (binary)
  let binaryDer: Uint8Array;
  try {
    const binaryString = atob(pemContents);
    binaryDer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      binaryDer[i] = binaryString.charCodeAt(i);
    }
  } catch (e) {
    console.error('Failed to decode base64 private key:', e);
    console.error('PEM contents length:', pemContents.length);
    console.error('First 50 chars:', pemContents.substring(0, 50));
    throw new Error('Failed to decode private key - invalid base64 encoding');
  }

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
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

    // Exchange JWT for access token with retry
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

    if (action === 'fetch') {
      // Fetch current access control list with retry
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

      if (rows.length === 0) {
        return new Response(
          JSON.stringify({ users: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const headerRow = rows[0];
      const usersList = rows.slice(1).map(row => ({
        email: row[0] || '',
        fullName: row[1] || '',
        role: row[2] || 'Viewer',
        accessToReporting: row[3]?.toLowerCase() === 'yes' || row[3] === 'true'
      }));

      return new Response(
        JSON.stringify({ users: usersList }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'update') {
      // Update access control list
      const sheetName = 'User Access Control';
      const range = `${sheetName}!A1:D${users.length + 1}`;
      
      const values = [
        ['Email Address', 'Full Name', 'Role', 'Access to Reporting'],
        ...users.map((u: any) => [
          u.email,
          u.fullName,
          u.role || 'Viewer',
          u.accessToReporting ? 'Yes' : 'No'
        ])
      ];

      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${accessSheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;

      const updateResponse = await fetchWithRetry(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update access control sheet: ${updateResponse.status} - ${errorText}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Access control updated successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error managing user access:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
