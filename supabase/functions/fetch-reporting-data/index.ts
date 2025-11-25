import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log(`Fetching reporting data for user: ${user.email}`);

    // Create JWT for Google Sheets API
    const serviceAccountEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const serviceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');

    if (!serviceAccountEmail || !serviceAccountKey || !spreadsheetId) {
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
    
    // Remove all whitespace characters (newlines, spaces, tabs, etc.)
    pemContents = pemContents.replace(/[\r\n\t\s]/g, '');
    
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
    console.log('Successfully obtained access token');

    // Determine which sheet to use
    const sheetName = Deno.env.get('SHEET_NAME') || 'Collection Schedule 1';
    console.log(`Using sheet: "${sheetName}"`);

    // Fetch all data from the Collection Schedule sheet with retry
    const range = `${sheetName}!A1:BA100`;
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

    const sheetsResponse = await fetchWithRetry(sheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!sheetsResponse.ok) {
      throw new Error(`Failed to fetch sheet data: ${sheetsResponse.status}`);
    }

    const sheetsData: GoogleSheetsResponse = await sheetsResponse.json();
    const rows = sheetsData.values || [];
    
    console.log(`Fetched rows: ${rows.length}`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data found in sheet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Parse header row to find column indices
    const headerRow = rows[0];
    const standNumberIdx = headerRow.findIndex(h => h?.toLowerCase().includes('stand number'));
    const firstNameIdx = headerRow.findIndex(h => h?.toLowerCase().includes('first name'));
    const lastNameIdx = headerRow.findIndex(h => h?.toLowerCase().includes('last name'));
    const emailIdx = headerRow.findIndex(h => h?.toLowerCase().includes('email'));
    const totalPriceIdx = headerRow.findIndex(h => h?.toLowerCase().includes('total price'));
    const totalPaidIdx = headerRow.findIndex(h => h?.toLowerCase().includes('total paid'));
    const currentBalanceIdx = headerRow.findIndex(h => h?.toLowerCase().includes('current balance'));
    const progressIdx = headerRow.findIndex(h => h?.toLowerCase().includes('payment progress'));
    const monthlyPaymentIdx = headerRow.findIndex(h => h?.toLowerCase().includes('payment'));
    const startDateIdx = headerRow.findIndex(h => h?.toLowerCase().includes('start date'));

    // Find month columns (starting from column M onwards)
    const monthColumns: Array<{ index: number; month: string }> = [];
    for (let i = 0; i < headerRow.length; i++) {
      const header = headerRow[i] || '';
      // Look for date patterns like "5 November 2025"
      if (header.match(/\d+\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i)) {
        monthColumns.push({ index: i, month: header });
      }
    }

    console.log(`Found ${monthColumns.length} month columns`);

    // Process all rows to extract stand data
    const allStands: any[] = [];
    const monthlyTotals: { [month: string]: { expected: number; received: number; count: number } } = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const standNumber = row[standNumberIdx] || '';
      const firstName = row[firstNameIdx] || '';
      const lastName = row[lastNameIdx] || '';
      const email = row[emailIdx] || '';
      const totalPrice = row[totalPriceIdx] || '0';
      const totalPaid = row[totalPaidIdx] || '0';
      const currentBalance = row[currentBalanceIdx] || '0';
      const progress = row[progressIdx] || '0';
      const monthlyPayment = row[monthlyPaymentIdx] || '0';

      // Check if this is an unsold stand
      const isUnsold = !firstName && !lastName && !email;

      // Extract payment history from month columns
      const payments: any[] = [];
      for (const monthCol of monthColumns) {
        const paymentValue = row[monthCol.index] || '';
        if (paymentValue && paymentValue.trim() !== '') {
          const amount = parseFloat(paymentValue.replace(/[$,]/g, '')) || 0;
          payments.push({
            month: monthCol.month,
            amount: paymentValue,
            amountNumeric: amount
          });

          // Aggregate monthly totals
          if (!monthlyTotals[monthCol.month]) {
            monthlyTotals[monthCol.month] = { expected: 0, received: 0, count: 0 };
          }
          monthlyTotals[monthCol.month].received += amount;
          if (!isUnsold) {
            const expectedAmount = parseFloat(monthlyPayment.replace(/[$,]/g, '')) || 0;
            monthlyTotals[monthCol.month].expected += expectedAmount;
            monthlyTotals[monthCol.month].count += 1;
          }
        }
      }

      allStands.push({
        standNumber,
        customerName: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        email,
        totalPrice,
        totalPaid,
        currentBalance,
        progressPercentage: parseFloat(progress.replace('%', '')) || 0,
        monthlyPayment,
        isUnsold,
        payments
      });
    }

    console.log(`Processed ${allStands.length} stands`);

    // Calculate summary statistics
    const soldStands = allStands.filter(s => !s.isUnsold);
    const unsoldStands = allStands.filter(s => s.isUnsold);
    
    const totalExpected = soldStands.reduce((sum, s) => {
      const price = parseFloat(s.totalPrice.replace(/[$,]/g, '')) || 0;
      return sum + price;
    }, 0);

    const totalReceived = soldStands.reduce((sum, s) => {
      const paid = parseFloat(s.totalPaid.replace(/[$,]/g, '')) || 0;
      return sum + paid;
    }, 0);

    const totalOutstanding = soldStands.reduce((sum, s) => {
      const balance = parseFloat(s.currentBalance.replace(/[$,]/g, '')) || 0;
      return sum + balance;
    }, 0);

    return new Response(
      JSON.stringify({
        stands: allStands,
        summary: {
          totalStands: allStands.length,
          soldStands: soldStands.length,
          unsoldStands: unsoldStands.length,
          totalExpected: `$${totalExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalReceived: `$${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalOutstanding: `$${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          collectionPercentage: totalExpected > 0 ? ((totalReceived / totalExpected) * 100).toFixed(2) : '0',
        },
        monthlyTotals: Object.entries(monthlyTotals).map(([month, data]) => ({
          month,
          expected: data.expected,
          received: data.received,
          percentage: data.expected > 0 ? ((data.received / data.expected) * 100).toFixed(2) : '0',
          count: data.count
        })),
        monthColumns: monthColumns.map(m => m.month)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
