import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const credentials = JSON.parse(keyString.replace(/\\\\n/g, '\\n'));
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
    let base64 = body.replace(/[^A-Za-z0-9+/\n]/g, '').replace(/\n/g, '');
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

// Format phone number with country code
function formatPhoneNumber(phone: string): string {
  if (!phone || phone.trim() === '') return '';
  
  // Remove all non-digit characters except +
  let cleaned = phone.toString().replace(/[^\\d+]/g, '');
  
  // If it starts with +, keep it as is (already has country code)
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // If it starts with 00, replace with +
  if (cleaned.startsWith('00')) {
    return '+' + cleaned.substring(2);
  }
  
  // Zimbabwe numbers
  if (cleaned.startsWith('263')) {
    return '+' + cleaned;
  }
  
  // If starts with 07 (Zimbabwe local mobile format)
  if (cleaned.startsWith('07') && cleaned.length >= 9) {
    return '+263' + cleaned.substring(1);
  }
  
  // If starts with 0 (other local formats)
  if (cleaned.startsWith('0')) {
    return '+263' + cleaned.substring(1);
  }
  
  // US/International numbers that look like they might be full numbers
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    // Check if it might be a US number (10 digits)
    if (cleaned.length === 10 && !cleaned.startsWith('263')) {
      return '+1' + cleaned;
    }
    // If 11 digits starting with 1, it's likely US
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    // Otherwise assume it has country code
    return '+' + cleaned;
  }
  
  // Default: assume Zimbabwe and prepend +263
  if (cleaned.length >= 8) {
    return '+263' + cleaned;
  }
  
  return cleaned ? '+' + cleaned : '';
}

// Parse date from DD/MM/YYYY format
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const cleaned = dateStr.trim();
  
  // Handle DD/MM/YYYY format
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
    const year = parseInt(parts[2], 10);
    
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  
  // Try parsing as is
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

// Format date to DD/MM/YYYY for writing back
function formatDateForSheet(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Column letter to index (0-based)
function colLetterToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result - 1;
}

// Index to column letter (0-based)
function indexToColLetter(index: number): string {
  let result = '';
  index++;
  while (index > 0) {
    const remainder = (index - 1) % 26;
    result = String.fromCharCode('A'.charCodeAt(0) + remainder) + result;
    index = Math.floor((index - 1) / 26);
  }
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dryRun = true } = await req.json().catch(() => ({ dryRun: true }));
    
    console.log(`Starting payment rebuild from Sheet 7. Dry run: ${dryRun}`);
    
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID not configured');
    }

    const accessToken = await getGoogleAccessToken();
    
    // Step 1: Read data from Sheet 7 (A through AZ to get all payment columns)
    // Column A = Stand Number, Column I = Phone, Column Z onwards = Payment pairs
    const sheet7Range = encodeURIComponent("Sheet7!A:AZ");
    const sheet7Url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheet7Range}`;
    
    console.log('Fetching Sheet 7 data...');
    const sheet7Response = await fetch(sheet7Url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!sheet7Response.ok) {
      const error = await sheet7Response.text();
      console.error('Failed to fetch Sheet 7:', error);
      throw new Error(`Failed to fetch Sheet 7: ${error}`);
    }
    
    const sheet7Data = await sheet7Response.json();
    const sheet7Rows = sheet7Data.values || [];
    
    console.log(`Sheet 7 has ${sheet7Rows.length} rows`);
    
    if (sheet7Rows.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Sheet 7 has no data rows' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Column indices in Sheet 7 (0-based)
    const standNumCol = 0;  // Column A
    const phoneCol = 8;     // Column I
    const paymentStartCol = colLetterToIndex('Z'); // Column Z = 25
    
    // Process each row from Sheet 7
    interface PaymentEntry {
      amount: number;
      date: Date;
      dateStr: string;
    }
    
    interface StandData {
      standNumber: string;
      phone: string;
      payments: PaymentEntry[];
    }
    
    const standsData: StandData[] = [];
    
    // Skip header row (row 0)
    for (let i = 1; i < sheet7Rows.length; i++) {
      const row = sheet7Rows[i];
      const standNumber = row[standNumCol]?.toString().trim();
      
      if (!standNumber) continue;
      
      const rawPhone = row[phoneCol]?.toString() || '';
      const formattedPhone = formatPhoneNumber(rawPhone);
      
      // Extract payment pairs starting from column Z
      // Pattern: Amount, Date, Amount, Date, ...
      const payments: PaymentEntry[] = [];
      
      for (let col = paymentStartCol; col < row.length; col += 2) {
        const amountStr = row[col]?.toString().trim() || '';
        const dateStr = row[col + 1]?.toString().trim() || '';
        
        if (!amountStr || !dateStr) continue;
        
        // Parse amount (remove $ and commas)
        const amount = parseFloat(amountStr.replace(/[$,]/g, ''));
        if (isNaN(amount) || amount <= 0) continue;
        
        const date = parseDate(dateStr);
        if (!date) continue;
        
        payments.push({
          amount,
          date,
          dateStr: formatDateForSheet(date)
        });
      }
      
      // Sort payments chronologically
      payments.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      standsData.push({
        standNumber,
        phone: formattedPhone,
        payments
      });
      
      if (payments.length > 0) {
        console.log(`Stand ${standNumber}: Phone=${formattedPhone}, ${payments.length} payments`);
      }
    }
    
    console.log(`Processed ${standsData.length} stands from Sheet 7`);
    
    // Step 2: Read Collection Schedule 1 to find row indices for each stand
    const collectionRange = encodeURIComponent("Collection Schedule 1!A:BH");
    const collectionUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${collectionRange}`;
    
    console.log('Fetching Collection Schedule 1 data...');
    const collectionResponse = await fetch(collectionUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!collectionResponse.ok) {
      const error = await collectionResponse.text();
      throw new Error(`Failed to fetch Collection Schedule 1: ${error}`);
    }
    
    const collectionData = await collectionResponse.json();
    const collectionRows = collectionData.values || [];
    
    console.log(`Collection Schedule 1 has ${collectionRows.length} rows`);
    
    // Build a map of stand number to row index
    const standToRowIndex = new Map<string, number>();
    for (let i = 1; i < collectionRows.length; i++) {
      const standNum = collectionRows[i][0]?.toString().trim();
      if (standNum) {
        standToRowIndex.set(standNum, i + 1); // 1-indexed for sheets
      }
    }
    
    // Payment columns in Collection Schedule 1 (based on screenshot):
    // Column Z (25) = Payment 1 (amount)
    // Column AA (26) = Date of Payment 1
    // Column AB (27) = Payment 2 (amount)
    // Column AC (28) = Date of Payment 2
    // Column AD (29) = Payment 3 (amount)
    // Column AE (30) = Date of Payment 3
    // Column AF (31) = Payment 4 (amount)
    // Column AG (32) = Date of Payment 4
    // Column AH (33) = Payment 5 (amount)
    // Column AI (34) = Date of Payment 5
    // Column AJ (35) = Payment 6 (amount)
    // Pattern: Amounts at Z, AB, AD, AF, AH, AJ... (even offsets from Z)
    // Pattern: Dates at AA, AC, AE, AG, AI, AK... (odd offsets from Z)
    
    const paymentStartColCS1 = colLetterToIndex('Z'); // Column Z = 25 (0-indexed)
    
    // Prepare batch updates
    interface CellUpdate {
      range: string;
      values: string[][];
    }
    
    const updates: CellUpdate[] = [];
    const results: { stand: string; phone: string; paymentsWritten: number; error?: string }[] = [];
    
    for (const standData of standsData) {
      const rowIndex = standToRowIndex.get(standData.standNumber);
      
      if (!rowIndex) {
        results.push({
          stand: standData.standNumber,
          phone: standData.phone,
          paymentsWritten: 0,
          error: 'Stand not found in Collection Schedule 1'
        });
        continue;
      }
      
      // Update phone number in Column D
      if (standData.phone) {
        updates.push({
          range: `Collection Schedule 1!D${rowIndex}`,
          values: [[standData.phone]]
        });
      }
      
      // Write payments to Collection Schedule 1 in interleaved format:
      // Payment 1 Amount at Z, Payment 1 Date at AA
      // Payment 2 Amount at AB, Payment 2 Date at AC
      // etc.
      
      // Support up to 10 payments (columns Z through AS)
      const maxPayments = 10;
      
      for (let p = 0; p < maxPayments; p++) {
        // Payment amount column: Z, AB, AD, AF, AH, AJ, AL, AN, AP, AR
        const amountColIndex = paymentStartColCS1 + (p * 2);
        // Payment date column: AA, AC, AE, AG, AI, AK, AM, AO, AQ, AS
        const dateColIndex = paymentStartColCS1 + (p * 2) + 1;
        
        const amountColLetter = indexToColLetter(amountColIndex);
        const dateColLetter = indexToColLetter(dateColIndex);
        
        if (p < standData.payments.length) {
          const payment = standData.payments[p];
          // Write payment amount
          updates.push({
            range: `Collection Schedule 1!${amountColLetter}${rowIndex}`,
            values: [[`$${payment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]]
          });
          // Write payment date (preserve original date from Sheet 7)
          updates.push({
            range: `Collection Schedule 1!${dateColLetter}${rowIndex}`,
            values: [[payment.dateStr]]
          });
        } else {
          // Clear unused payment slots
          updates.push({
            range: `Collection Schedule 1!${amountColLetter}${rowIndex}`,
            values: [['']]
          });
          updates.push({
            range: `Collection Schedule 1!${dateColLetter}${rowIndex}`,
            values: [['']]
          });
        }
      }
      
      results.push({
        stand: standData.standNumber,
        phone: standData.phone,
        paymentsWritten: standData.payments.length
      });
    }
    
    console.log(`Prepared ${updates.length} cell updates for ${results.length} stands`);
    
    // Execute updates if not dry run
    if (!dryRun && updates.length > 0) {
      console.log('Executing batch update...');
      
      // Use batchUpdate for efficiency
      const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
      
      const batchResponse = await fetch(batchUpdateUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: updates.map(u => ({
            range: u.range,
            values: u.values
          }))
        }),
      });
      
      if (!batchResponse.ok) {
        const error = await batchResponse.text();
        console.error('Batch update failed:', error);
        throw new Error(`Batch update failed: ${error}`);
      }
      
      const batchResult = await batchResponse.json();
      console.log('Batch update successful:', batchResult.totalUpdatedCells, 'cells updated');
    }
    
    const summary = {
      dryRun,
      totalStandsProcessed: standsData.length,
      totalUpdates: updates.length,
      results: results.slice(0, 50), // Limit results in response
      hasMore: results.length > 50
    };
    
    console.log('Migration complete:', JSON.stringify(summary, null, 2));
    
    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    console.error('Error in payment rebuild:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
