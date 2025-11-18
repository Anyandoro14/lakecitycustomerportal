import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { customerId } = await req.json();
    console.log('Fetching data for customer:', customerId);

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
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(signatureInput)
    );

    // Convert signature to base64url
    const signatureArray = new Uint8Array(signature);
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const jwt = `${signatureInput}.${signatureBase64}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Token error:', tokenData);
      throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`);
    }
    
    const { access_token } = tokenData;
    console.log('Successfully obtained access token');

    // Fetch data from Google Sheets
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    const range = 'Sheet1!A:Z'; // Adjust range as needed
    
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const data: GoogleSheetsResponse = await sheetsResponse.json();
    console.log('Fetched rows:', data.values?.length || 0);

    // Parse the data (assuming first row is headers)
    const headers = data.values[0];
    const rows = data.values.slice(1);
    
    // Find the customer row by Stand Number (column A)
    const customerRow = rows.find(row => row[0] === customerId);
    
    if (!customerRow) {
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map the data based on your sheet structure
    const customerData = {
      customerId: customerRow[0], // Stand Number
      customerName: `${customerRow[1]} ${customerRow[2]}`, // First Name + Last Name
      standNumber: customerRow[0], // Stand Number
      standBalance: customerRow[7] || '$0.00', // TOTAL PRICE
      lastPayment: customerRow[9] || '$0.00', // PAYMENT
      nextPayment: customerRow[9] || '$0.00', // PAYMENT
      currentBalance: customerRow[7] || '$0.00', // TOTAL PRICE
      lastDueDate: customerRow[10] || 'N/A', // START DATE
      monthlyPayment: customerRow[9] || '$0.00', // PAYMENT
      nextDueDate: customerRow[11] || 'N/A', // NEXT INSTALLMENT DATE
    };

    return new Response(
      JSON.stringify(customerData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-google-sheets:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
