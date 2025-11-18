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

    // Parse the service account credentials
    let credentialsString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '{}';
    
    // Handle escaped newlines in the secret
    credentialsString = credentialsString.replace(/\\n/g, '\n');
    
    const credentials = JSON.parse(credentialsString);
    console.log('Parsed credentials for:', credentials.client_email);
    
    // Get access token using service account
    const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const jwtClaimSet = btoa(JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }));

    const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
    
    // Clean and prepare the private key
    const privateKeyPem = credentials.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\\n/g, '')
      .replace(/\n/g, '')
      .trim();
    
    // Import the private key
    const binaryKey = Uint8Array.from(atob(privateKeyPem), c => c.charCodeAt(0));
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
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

    const jwt = `${signatureInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const { access_token } = await tokenResponse.json();
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
