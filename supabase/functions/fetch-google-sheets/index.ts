import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleSheetsResponse {
  values: string[][];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with the user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          authorization: authHeader
        }
      }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's profile to check if they have access
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the authenticated user's email to find their stand
    const userEmail = user.email || profile.email;
    console.log('Fetching data for user:', userEmail);

    // Get credentials - support both JSON and separate key/email
    const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
    const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
    
    let privateKeyPem: string;
    let serviceAccountEmail: string;
    
    // Try parsing as JSON first
    try {
      const credentials = JSON.parse(keyString.replace(/\\n/g, '\n'));
      privateKeyPem = credentials.private_key;
      serviceAccountEmail = credentials.client_email;
    } catch {
      // If not JSON, treat as raw private key
      privateKeyPem = keyString;
      serviceAccountEmail = clientEmail;
    }
    // Validate service account email format
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!serviceAccountEmail || !emailRegex.test(serviceAccountEmail)) {
      console.error('Invalid or missing service account email');
      return new Response(
        JSON.stringify({ error: 'Invalid service account email. Re-upload full JSON key or set GOOGLE_CLIENT_EMAIL.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    
    // Base64url encode (not regular base64)
    const base64url = (str: string) => {
      return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };
    
    const jwtHeader = base64url(JSON.stringify(header));
    const jwtClaimSet = base64url(JSON.stringify(claimSet));
    const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
    
    // Clean and prepare the private key (support PEM with or without headers)
    const extractPemBase64 = (pem: string) => {
      const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
      const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
      const body = match ? match[1] : normalized; // if no headers, assume it's the raw body
      // Remove any characters not allowed in base64
      let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
      // Add padding if missing
      const pad = base64.length % 4;
      if (pad === 2) base64 += '==';
      else if (pad === 3) base64 += '=';
      else if (pad === 1) throw new Error('Invalid base64 length');
      return base64;
    };

    const base64Key = extractPemBase64(privateKeyPem);

    // Import the private key
    let buffer: ArrayBuffer;
    try {
      const raw = atob(base64Key);
      buffer = new ArrayBuffer(raw.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
    } catch (e) {
      console.error('Failed to base64-decode private key');
      return new Response(JSON.stringify({ error: 'Invalid private key format. Please re-upload the key.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the JWT
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(signatureInput)
    );

    const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return new Response(
        JSON.stringify({ error: `Failed to get access token: ${errorData}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token } = await tokenResponse.json();
    console.log('Successfully obtained access token');

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: 'SPREADSHEET_ID not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, get spreadsheet metadata to determine the sheet title
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('Metadata fetch error:', errorText);
      return new Response(
        JSON.stringify({ 
          error: `Google Sheets API error (${metadataResponse.status}). Check: 1) Spreadsheet ID is correct, 2) Sheet is shared with ${serviceAccountEmail} as Viewer` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];
    
    // Determine which sheet to use
    const preferredName = Deno.env.get('SHEET_NAME');
    const preferredGid = Deno.env.get('SHEET_GID');
    
    let sheetTitle = 'Sheet1'; // Default fallback
    
    if (preferredName) {
      const found = sheets.find((s: any) => s.properties.title === preferredName);
      if (found) {
        sheetTitle = found.properties.title;
      }
    } else if (preferredGid) {
      const found = sheets.find((s: any) => s.properties.sheetId?.toString() === preferredGid);
      if (found) {
        sheetTitle = found.properties.title;
      }
    } else if (sheets.length > 0) {
      sheetTitle = sheets[0].properties.title;
    }

    console.log(`Using sheet: "${sheetTitle}"`);

    // Fetch the data
    const range = encodeURIComponent(`${sheetTitle}!A:Z`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Sheets fetch error:', errorText);
      return new Response(
        JSON.stringify({ 
          error: `Google Sheets API error (${response.status}). Check: 1) Spreadsheet ID is correct, 2) Sheet is shared with ${serviceAccountEmail} as Viewer` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: GoogleSheetsResponse = await response.json();
    const rows = data.values || [];
    
    console.log(`Fetched rows: ${rows.length}`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data found in spreadsheet' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find header row
    const headers = rows[0];
    const standNumIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('stand'));
    const emailIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('email'));
    
    if (standNumIndex === -1) {
      return new Response(
        JSON.stringify({ error: 'Could not find "Stand Number" column in spreadsheet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (emailIndex === -1) {
      return new Response(
        JSON.stringify({ error: 'Could not find "Email" column in spreadsheet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the customer row by matching the user's email
    const customerRow = rows.slice(1).find(row => 
      row[emailIndex] && row[emailIndex].toString().trim().toLowerCase() === userEmail.toLowerCase()
    );

    if (!customerRow) {
      return new Response(
        JSON.stringify({ error: `Your email (${userEmail}) is not authorized to view any stand. Please contact support.` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the stand number for this authorized user
    const standNumber = customerRow[standNumIndex];
    console.log(`User ${userEmail} authorized for stand: ${standNumber}`);

    // Map the data
    const customerData = {
      customerId: customerRow[0] || '',
      standNumber: standNumber || '',
      customerName: customerRow[1] || '',
      standBalance: customerRow[2] || '0',
      lastPayment: customerRow[3] || '',
      nextPayment: customerRow[4] || '',
      currentBalance: customerRow[5] || '0',
      lastDueDate: customerRow[6] || '',
      monthlyPayment: customerRow[7] || '0',
      nextDueDate: customerRow[8] || '',
    };

    return new Response(
      JSON.stringify(customerData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
