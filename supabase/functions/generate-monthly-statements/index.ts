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

interface PaymentRecord {
  date: string;
  amount: string;
  installment_period: string;
}

interface CustomerData {
  email: string;
  standNumber: string;
  fullName: string;
  totalPrice: number;
  totalPaid: number;
  currentBalance: number;
  payments: PaymentRecord[];
}

interface StatementRecord {
  stand_number: string;
  customer_email: string;
  statement_month: string;
  opening_balance: number;
  payments_received: any[];
  total_payments: number;
  closing_balance: number;
  is_overdue: boolean;
  days_overdue: number;
  generated_at: string;
}

// Parse currency string to number
const parseCurrency = (val: string): number => {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Format number as currency
const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(val);
};

// Get the last day of a month
const getLastDayOfMonth = (year: number, month: number): Date => {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
};

// Parse date string to Date object
const parsePaymentDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
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

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!serviceAccountEmail || !emailRegex.test(serviceAccountEmail)) {
    throw new Error('Invalid or missing service account email');
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

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(signatureInput)
  );

  const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

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
    throw new Error(`Failed to get access token: ${errorData}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

// Fetch all customer data from Google Sheets
async function fetchAllCustomerData(accessToken: string): Promise<CustomerData[]> {
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
  
  const preferredName = Deno.env.get('SHEET_NAME');
  const preferredGid = Deno.env.get('SHEET_GID');
  
  let sheetTitle = 'Sheet1';
  
  if (preferredName) {
    const found = sheets.find((s: any) => s.properties.title === preferredName);
    if (found) sheetTitle = found.properties.title;
  } else if (preferredGid) {
    const found = sheets.find((s: any) => s.properties.sheetId?.toString() === preferredGid);
    if (found) sheetTitle = found.properties.title;
  } else if (sheets.length > 0) {
    sheetTitle = sheets[0].properties.title;
  }

  console.log(`Using sheet: "${sheetTitle}"`);

  // Fetch the data
  const range = encodeURIComponent(`${sheetTitle}!A:AZ`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch sheet data');
  }

  const data: GoogleSheetsResponse = await response.json();
  const rows = data.values || [];
  
  console.log(`Fetched ${rows.length} rows from sheet`);

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  const standNumIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('stand'));
  const firstNameIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('first'));
  const lastNameIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('last'));
  const emailIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('email'));
  const totalPriceIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('total price'));

  if (standNumIndex === -1 || emailIndex === -1) {
    throw new Error('Required columns not found in spreadsheet');
  }

  // Column M (index 12) is now September 5, 2025 (new column added)
  // Column AW (index 48) is end of payment months (shifted +1)
  // Column AY (index 50) is Total Paid (shifted +1)
  // Column AZ (index 51) is Current Balance (shifted +1)
  const paymentStartCol = 12; // Column M - now September 2025
  const paymentEndCol = 48; // Column AW (shifted from AV)
  const totalPaidCol = 50; // Column AY (shifted from AX)
  const currentBalanceCol = 51; // Column AZ (shifted from AY)

  const customers: CustomerData[] = [];

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const email = row[emailIndex]?.toString().trim().toLowerCase();
    const standNumber = row[standNumIndex]?.toString().trim();

    if (!email || !standNumber) continue;

    const firstName = firstNameIndex !== -1 ? (row[firstNameIndex] || '') : '';
    const lastName = lastNameIndex !== -1 ? (row[lastNameIndex] || '') : '';
    const fullName = `${firstName} ${lastName}`.trim();

    const totalPrice = totalPriceIndex !== -1 ? parseCurrency(row[totalPriceIndex]) : 0;
    const totalPaid = parseCurrency(row[totalPaidCol]);
    const currentBalance = parseCurrency(row[currentBalanceCol]);

    // Get first payment header to determine base date
    // Column M is now September 5, 2025
    const firstPaymentHeader = headers[paymentStartCol];
    let basePaymentDate = new Date(2025, 8, 5); // September 5, 2025 default (updated from October)
    if (firstPaymentHeader) {
      const parsedHeaderDate = new Date(firstPaymentHeader);
      if (!isNaN(parsedHeaderDate.getTime())) {
        basePaymentDate = parsedHeaderDate;
      }
    }

    // Extract payments with dates
    const payments: PaymentRecord[] = [];
    for (let i = paymentStartCol; i <= paymentEndCol; i++) {
      const paymentValue = row[i]?.toString().trim();
      if (paymentValue && paymentValue !== '') {
        const monthOffset = i - paymentStartCol;
        const paymentDate = new Date(basePaymentDate);
        paymentDate.setMonth(paymentDate.getMonth() + monthOffset);
        
        // Installment period is the month this payment applies to
        const installmentPeriod = paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        
        payments.push({
          date: paymentDate.toISOString().split('T')[0], // YYYY-MM-DD format
          amount: paymentValue,
          installment_period: installmentPeriod
        });
      }
    }

    customers.push({
      email,
      standNumber,
      fullName,
      totalPrice,
      totalPaid,
      currentBalance,
      payments
    });
  }

  console.log(`Processed ${customers.length} customers from sheet`);
  return customers;
}

// Generate statements for a single customer (optimized - batch insert)
function generateStatementsForCustomerSync(
  customer: CustomerData,
  startMonth: Date,
  endMonth: Date,
  paymentStartDate: Date,
  existingStatements: Set<string>
): StatementRecord[] {
  const statements: StatementRecord[] = [];
  const currentMonth = new Date(startMonth);
  let previousClosingBalance = customer.totalPrice;

  while (currentMonth <= endMonth) {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const statementMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const statementKey = `${customer.standNumber}|${customer.email}|${statementMonth}`;

    // Check if statement already exists
    if (existingStatements.has(statementKey)) {
      // We need to track closing balance from existing data - handled separately
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      continue;
    }

    const lastDayOfMonth = getLastDayOfMonth(year, month);

    // Filter payments that occurred during this month
    const paymentsThisMonth = customer.payments.filter(p => {
      const paymentDate = parsePaymentDate(p.date);
      if (!paymentDate) return false;
      return paymentDate.getFullYear() === year && paymentDate.getMonth() === month;
    });

    // Calculate totals
    const openingBalance = previousClosingBalance;
    const totalPaymentsReceived = paymentsThisMonth.reduce((sum, p) => sum + parseCurrency(p.amount), 0);
    const closingBalance = openingBalance - totalPaymentsReceived;

    // Determine overdue status
    const statementDate = new Date(year, month, 1);
    const isBeforePaymentStart = statementDate < paymentStartDate;
    
    let isOverdue = false;
    let daysOverdue = 0;
    
    if (!isBeforePaymentStart) {
      isOverdue = closingBalance > 0 && new Date() > lastDayOfMonth;
      daysOverdue = isOverdue 
        ? Math.floor((new Date().getTime() - lastDayOfMonth.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    }

    // Format payments for JSONB storage
    const paymentsJson = paymentsThisMonth.map(p => ({
      date: p.date,
      amount: p.amount,
      installment_period: p.installment_period,
      amount_numeric: parseCurrency(p.amount)
    }));

    statements.push({
      stand_number: customer.standNumber,
      customer_email: customer.email,
      statement_month: statementMonth,
      opening_balance: openingBalance,
      payments_received: paymentsJson,
      total_payments: totalPaymentsReceived,
      closing_balance: closingBalance,
      is_overdue: isOverdue,
      days_overdue: daysOverdue,
      generated_at: new Date().toISOString()
    });

    previousClosingBalance = closingBalance;
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  return statements;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log('Starting monthly statement generation (optimized)...');

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for optional parameters
    let targetMonth: string | null = null;
    let targetStand: string | null = null;
    
    try {
      const body = await req.json();
      targetMonth = body.target_month || null;
      targetStand = body.target_stand || null;
    } catch {
      // No body provided, generate all
    }

    // Run Google auth and profiles fetch in parallel
    console.log('Fetching data in parallel...');
    const [accessToken, profilesResult] = await Promise.all([
      getGoogleAccessToken(),
      supabase.from('profiles').select('stand_number, payment_start_date')
    ]);

    const profiles = profilesResult.data || [];
    if (profilesResult.error) {
      console.warn('Could not fetch profiles:', profilesResult.error.message);
    }

    // Create payment start date map
    const paymentStartDateMap: Record<string, Date> = {};
    const defaultPaymentStartDate = new Date(2025, 8, 5);
    for (const profile of profiles) {
      if (profile.stand_number && profile.payment_start_date) {
        paymentStartDateMap[profile.stand_number] = new Date(profile.payment_start_date);
      }
    }

    // Fetch customer data from sheets
    console.log('Fetching customer data from Google Sheets...');
    const customers = await fetchAllCustomerData(accessToken);

    if (customers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No customers found', created: 0, skipped: 0, duration_ms: Date.now() - startTime }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine date range
    const startMonth = new Date(2025, 9, 1); // October 2025
    let endMonth: Date;
    if (targetMonth) {
      const [year, month] = targetMonth.split('-').map(Number);
      endMonth = new Date(year, month - 1, 1);
    } else {
      endMonth = new Date();
      endMonth.setDate(1);
    }

    console.log(`Date range: ${startMonth.toLocaleDateString()} to ${endMonth.toLocaleDateString()}`);

    // Filter customers if target stand specified
    const customersToProcess = targetStand 
      ? customers.filter(c => c.standNumber === targetStand)
      : customers;

    console.log(`Processing ${customersToProcess.length} customers...`);

    // OPTIMIZATION: Fetch ALL existing statements in one query
    const standNumbers = customersToProcess.map(c => c.standNumber);
    const { data: existingStatementsData, error: existingError } = await supabase
      .from('monthly_statements')
      .select('stand_number, customer_email, statement_month, closing_balance')
      .in('stand_number', standNumbers);

    if (existingError) {
      console.warn('Error fetching existing statements:', existingError.message);
    }

    // Build a set of existing statement keys for O(1) lookup
    const existingStatements = new Set<string>();
    const existingClosingBalances: Record<string, number> = {};
    
    for (const stmt of existingStatementsData || []) {
      const key = `${stmt.stand_number}|${stmt.customer_email}|${stmt.statement_month}`;
      existingStatements.add(key);
      existingClosingBalances[key] = parseFloat(stmt.closing_balance);
    }

    console.log(`Found ${existingStatements.size} existing statements`);

    // Generate all new statements in memory (no DB calls)
    const allNewStatements: StatementRecord[] = [];
    
    for (const customer of customersToProcess) {
      const customerPaymentStartDate = paymentStartDateMap[customer.standNumber] || defaultPaymentStartDate;
      
      const customerStatements = generateStatementsForCustomerSync(
        customer,
        startMonth,
        endMonth,
        customerPaymentStartDate,
        existingStatements
      );
      
      allNewStatements.push(...customerStatements);
    }

    console.log(`Generated ${allNewStatements.length} new statements to insert`);

    // OPTIMIZATION: Batch insert all statements at once (max 1000 per batch for safety)
    let totalCreated = 0;
    const batchSize = 500;
    
    for (let i = 0; i < allNewStatements.length; i += batchSize) {
      const batch = allNewStatements.slice(i, i + batchSize);
      
      const { error: insertError, data: insertedData } = await supabase
        .from('monthly_statements')
        .insert(batch)
        .select('id');
      
      if (insertError) {
        console.error(`Batch insert error (batch ${Math.floor(i / batchSize) + 1}):`, insertError.message);
        // Continue with other batches
      } else {
        const insertedCount = insertedData?.length || batch.length;
        totalCreated += insertedCount;
        console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: ${insertedCount} statements`);
      }
    }

    const totalSkipped = existingStatements.size;
    const duration = Date.now() - startTime;

    console.log(`Statement generation complete in ${duration}ms. Created: ${totalCreated}, Skipped: ${totalSkipped}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Statement generation complete`,
        customers_processed: customersToProcess.length,
        statements_created: totalCreated,
        statements_skipped: totalSkipped,
        duration_ms: duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating monthly statements:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, duration_ms: Date.now() - startTime }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
