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
  reference?: string;
  payment_method?: string;
}

// Extended receipt record from Receipts_Intake
interface ReceiptRecord {
  intake_id: string;
  stand_number: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  reference: string;
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

// Fetch itemized receipts from Receipts_Intake sheet
async function fetchItemizedReceipts(accessToken: string): Promise<Map<string, ReceiptRecord[]>> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    console.log('No SPREADSHEET_ID for receipts fetch');
    return new Map();
  }

  try {
    // Get metadata to find Receipts_Intake sheet
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metadataResponse.ok) {
      console.log('Could not fetch metadata for receipts');
      return new Map();
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];
    const receiptsSheet = sheets.find((s: any) => s.properties.title === 'Receipts_Intake');

    if (!receiptsSheet) {
      console.log('Receipts_Intake sheet not found - using column-based dates for statements');
      return new Map();
    }

    const sheetTitle = receiptsSheet.properties.title;
    console.log(`Fetching itemized receipts from: "${sheetTitle}"`);

    // Fetch all receipts
    const range = encodeURIComponent(`${sheetTitle}!A:L`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.log('Could not fetch Receipts_Intake data');
      return new Map();
    }

    const data: GoogleSheetsResponse = await response.json();
    const rows = data.values || [];
    
    console.log(`Fetched ${rows.length} receipt rows for statements`);

    if (rows.length < 2) {
      return new Map();
    }

    // Column indices for Receipts_Intake
    const COL_INTAKE_ID = 0;
    const COL_STAND_NUMBER = 2;
    const COL_PAYMENT_DATE = 4;
    const COL_PAYMENT_AMOUNT = 5;
    const COL_PAYMENT_METHOD = 6;
    const COL_REFERENCE = 7;
    const COL_INTAKE_STATUS = 10;

    // Build map of stand_number -> receipts (only Posted receipts)
    const receiptsMap = new Map<string, ReceiptRecord[]>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const standNumber = row[COL_STAND_NUMBER]?.toString().trim().toUpperCase() || '';
      const intakeStatus = row[COL_INTAKE_STATUS]?.toString().trim() || '';
      
      // Only include Posted receipts
      if (!standNumber) continue;
      if (intakeStatus !== 'Posted') continue;
      
      const paymentAmount = parseCurrency(row[COL_PAYMENT_AMOUNT]?.toString() || '');
      if (paymentAmount <= 0) continue;

      const receipt: ReceiptRecord = {
        intake_id: row[COL_INTAKE_ID]?.toString().trim() || `ROW_${i + 1}`,
        stand_number: standNumber,
        payment_date: row[COL_PAYMENT_DATE]?.toString().trim() || '',
        payment_amount: paymentAmount,
        payment_method: row[COL_PAYMENT_METHOD]?.toString().trim() || '',
        reference: row[COL_REFERENCE]?.toString().trim() || ''
      };

      if (!receiptsMap.has(standNumber)) {
        receiptsMap.set(standNumber, []);
      }
      receiptsMap.get(standNumber)!.push(receipt);
    }

    // Sort receipts by payment date (oldest first for statement generation)
    for (const [stand, receipts] of receiptsMap) {
      receipts.sort((a, b) => {
        const dateA = new Date(a.payment_date);
        const dateB = new Date(b.payment_date);
        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        return dateA.getTime() - dateB.getTime(); // Oldest first
      });
    }

    console.log(`Built itemized receipts map for ${receiptsMap.size} stands`);
    return receiptsMap;

  } catch (error) {
    console.error('Error fetching itemized receipts:', error);
    return new Map();
  }
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

  // Email column is optional - we can generate placeholder emails from stand numbers
  if (standNumIndex === -1) {
    throw new Error('Required stand number column not found in spreadsheet');
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
    const standNumber = row[standNumIndex]?.toString().trim();
    
    // Skip rows without stand number
    if (!standNumber) continue;
    
    // Use email from sheet if available, otherwise generate placeholder email from stand number
    // This matches the registration pattern: stand-{standNumber}@lakecity.portal
    let email = emailIndex !== -1 ? row[emailIndex]?.toString().trim().toLowerCase() : '';
    if (!email) {
      email = `stand-${standNumber}@lakecity.portal`;
    }

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
// UPDATED: Uses currentBalance from sheet (Column AZ) as source of truth for the latest statement
// Previous months work backwards from there
// ENHANCED: Uses itemized receipts for actual payment dates when available
function generateStatementsForCustomerSync(
  customer: CustomerData,
  startMonth: Date,
  endMonth: Date,
  paymentStartDate: Date,
  existingStatements: Set<string>,
  itemizedReceipts: ReceiptRecord[]
): StatementRecord[] {
  const statements: StatementRecord[] = [];
  
  // Build monthly payment map using ITEMIZED RECEIPTS if available (preferred)
  // This provides actual receipt dates instead of column-position dates
  const monthlyPaymentsMap: Record<string, { payments: PaymentRecord[], receipts: ReceiptRecord[], total: number }> = {};
  let totalPaymentsAll = 0;
  
  if (itemizedReceipts.length > 0) {
    // Use itemized receipts from Receipts_Intake (preferred - has actual dates)
    console.log(`Using ${itemizedReceipts.length} itemized receipts for statement generation`);
    
    for (const receipt of itemizedReceipts) {
      const paymentDate = parsePaymentDate(receipt.payment_date);
      if (!paymentDate) continue;
      
      const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (!monthlyPaymentsMap[monthKey]) {
        monthlyPaymentsMap[monthKey] = { payments: [], receipts: [], total: 0 };
      }
      
      monthlyPaymentsMap[monthKey].receipts.push(receipt);
      monthlyPaymentsMap[monthKey].total += receipt.payment_amount;
      totalPaymentsAll += receipt.payment_amount;
    }
  } else {
    // Fallback: Use column-based payments from Collection Schedule
    console.log(`Using column-based payments for statement generation (no itemized receipts)`);
    
    for (const payment of customer.payments) {
      const paymentDate = parsePaymentDate(payment.date);
      if (!paymentDate) continue;
      
      const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (!monthlyPaymentsMap[monthKey]) {
        monthlyPaymentsMap[monthKey] = { payments: [], receipts: [], total: 0 };
      }
      const paymentAmount = parseCurrency(payment.amount);
      monthlyPaymentsMap[monthKey].payments.push(payment);
      monthlyPaymentsMap[monthKey].total += paymentAmount;
      totalPaymentsAll += paymentAmount;
    }
  }
  
  // Use sheet's currentBalance (Column AZ) as the authoritative closing balance for the MOST RECENT month
  // Then work backwards to calculate opening balances for previous months
  // closingBalance = previousClosingBalance - payments
  // So: openingBalance = closingBalance + payments
  
  // First, collect all months we need to generate (that don't already exist)
  const monthsToGenerate: string[] = [];
  const tempMonth = new Date(startMonth);
  while (tempMonth <= endMonth) {
    const statementMonth = `${tempMonth.getFullYear()}-${String(tempMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const statementKey = `${customer.standNumber}|${customer.email}|${statementMonth}`;
    if (!existingStatements.has(statementKey)) {
      monthsToGenerate.push(statementMonth);
    }
    tempMonth.setMonth(tempMonth.getMonth() + 1);
  }
  
  if (monthsToGenerate.length === 0) {
    return [];
  }
  
  // Sort months in descending order to work backwards from the current balance
  monthsToGenerate.sort((a, b) => b.localeCompare(a));
  
  // Start with the sheet's current balance as the closing balance of the most recent month
  let closingBalance = customer.currentBalance;
  
  for (const statementMonth of monthsToGenerate) {
    const [yearStr, monthStr] = statementMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1;
    const lastDayOfMonth = getLastDayOfMonth(year, month);
    
    // Get payments for this month
    const monthData = monthlyPaymentsMap[statementMonth] || { payments: [], receipts: [], total: 0 };
    const totalPaymentsReceived = monthData.total;
    
    // Opening balance = closing balance + payments made this month
    // (working backwards: if we ended with X and paid Y during the month, we started with X + Y)
    const openingBalance = closingBalance + totalPaymentsReceived;
    
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
    
    // Format payments for JSONB storage - include itemized receipts with actual dates
    let paymentsJson: any[];
    
    if (monthData.receipts.length > 0) {
      // Use itemized receipts (has actual receipt dates, reference, payment method)
      paymentsJson = monthData.receipts.map(r => ({
        date: r.payment_date,
        amount: `$${r.payment_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        installment_period: `${new Date(r.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`,
        amount_numeric: r.payment_amount,
        reference: r.reference || undefined,
        payment_method: r.payment_method || undefined
      }));
    } else {
      // Fallback to column-based payments
      paymentsJson = monthData.payments.map(p => ({
        date: p.date,
        amount: p.amount,
        installment_period: p.installment_period,
        amount_numeric: parseCurrency(p.amount)
      }));
    }
    
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
    
    // Move to previous month: the opening balance of this month becomes the closing balance of the previous month
    closingBalance = openingBalance;
  }
  
  // Statements were built in reverse order, sort them chronologically for insertion
  statements.sort((a, b) => a.statement_month.localeCompare(b.statement_month));
  
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
    let refreshMode: boolean = false;
    
    try {
      const body = await req.json();
      targetMonth = body.target_month || null;
      targetStand = body.target_stand || null;
      refreshMode = body.refresh === true; // If true, update existing statements
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

    // Fetch customer data and itemized receipts from sheets in parallel
    console.log('Fetching customer data and itemized receipts from Google Sheets...');
    const [customers, itemizedReceiptsMap] = await Promise.all([
      fetchAllCustomerData(accessToken),
      fetchItemizedReceipts(accessToken)
    ]);

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

    // In refresh mode, delete existing statements for target stands so they can be regenerated
    if (refreshMode && standNumbers.length > 0) {
      console.log(`Refresh mode: deleting existing statements for ${standNumbers.length} stands...`);
      const { error: deleteError } = await supabase
        .from('monthly_statements')
        .delete()
        .in('stand_number', standNumbers);
      
      if (deleteError) {
        console.error('Error deleting existing statements:', deleteError.message);
      } else {
        existingStatements.clear(); // Clear the set since we deleted them
        console.log('Existing statements deleted for refresh');
      }
    }

    // Generate all new statements in memory (no DB calls)
    const allNewStatements: StatementRecord[] = [];
    
    for (const customer of customersToProcess) {
      const customerPaymentStartDate = paymentStartDateMap[customer.standNumber] || defaultPaymentStartDate;
      
      // Get itemized receipts for this customer
      const standKey = customer.standNumber.toUpperCase();
      const customerReceipts = itemizedReceiptsMap.get(standKey) || [];
      
      const customerStatements = generateStatementsForCustomerSync(
        customer,
        startMonth,
        endMonth,
        customerPaymentStartDate,
        existingStatements,
        customerReceipts
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
