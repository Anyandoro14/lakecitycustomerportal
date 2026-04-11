import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listCollectionScheduleDataTabTitles } from "../_shared/collection-schedule-sheets.ts";

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

    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metaRes = await fetchWithRetry(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch spreadsheet metadata: ${metaRes.status}`);
    }
    const metaJson = await metaRes.json();
    const sheetMetas = metaJson.sheets || [];

    const envSheet = Deno.env.get('SHEET_NAME')?.trim();
    const tabTitles: string[] = envSheet
      ? [envSheet]
      : listCollectionScheduleDataTabTitles(sheetMetas);
    console.log(`Reporting tabs (${tabTitles.length}): ${tabTitles.join(", ")}`);

    const merged: string[][] = [];
    let headerRow: string[] | null = null;

    for (const sheetName of tabTitles) {
      const range = `${sheetName}!A1:ZZ200`;
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

      const sheetsResponse = await fetchWithRetry(sheetsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!sheetsResponse.ok) {
        console.warn(`Skip tab "${sheetName}": ${sheetsResponse.status}`);
        continue;
      }

      const sheetsData: GoogleSheetsResponse = await sheetsResponse.json();
      const part = sheetsData.values || [];
      if (part.length === 0) continue;
      if (!headerRow) {
        headerRow = part[0];
        merged.push(headerRow);
      }
      for (let r = 1; r < part.length; r++) {
        merged.push(part[r]);
      }
    }

    const rows = merged;
    
    console.log(`Fetched rows: ${rows.length}`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data found in sheet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Parse header row to find column indices
    if (!headerRow) headerRow = rows[0];
    const standNumberIdx = headerRow!.findIndex(h => h?.toLowerCase().includes('stand number'));
    const hr = headerRow!;
    const firstNameIdx = hr.findIndex(h => h?.toLowerCase().includes('first name'));
    const lastNameIdx = hr.findIndex(h => h?.toLowerCase().includes('last name'));
    const emailIdx = hr.findIndex(h => h?.toLowerCase().includes('email'));
    const phoneNumberIdx = hr.findIndex(h => h?.toLowerCase().includes('phone') || h?.toLowerCase().includes('mobile') || h?.toLowerCase().includes('cell'));
    const countryCodeIdx = 3;
    const customerCategoryIdx = 5;
    const totalPriceIdx = hr.findIndex(h => h?.toLowerCase().includes('total price'));
    const totalPaidIdx = hr.findIndex(h => h?.toLowerCase().includes('total paid'));
    const currentBalanceIdx = hr.findIndex(h => h?.toLowerCase().includes('current balance'));
    const progressIdx = hr.findIndex(h => h?.toLowerCase().includes('payment progress'));
    const monthlyPaymentIdx = hr.findIndex(
      (h) =>
        h &&
        h.toString().toLowerCase().includes('payment') &&
        !h.toString().toLowerCase().includes('progress'),
    );
    const startDateIdx = hr.findIndex(h => h?.toLowerCase().includes('start date'));
    const depositIdx = hr.findIndex(h => {
      const lower = (h || '').toLowerCase();
      return lower === 'deposit' || lower === 'deposit amount';
    });
    const termLengthIdx = hr.findIndex(h => {
      const lower = (h || '').toLowerCase();
      return lower.includes('term') && lower.includes('length');
    });

    const findByIncludes = (sub: string) =>
      hr.findIndex((h) => h && h.toString().toLowerCase().includes(sub));

    const offerReceivedIdx = findByIncludes('offer received');
    const initialPaymentCompletedIdx = findByIncludes('initial payment completed');
    const agreementRequestedIdx = findByIncludes('agreement requested');
    const agreementSignedWarwickshireIdx = findByIncludes('agreement signed by warwickshire') >= 0
      ? findByIncludes('agreement signed by warwickshire')
      : findByIncludes('warwickshire');
    const agreementSignedClientIdx = findByIncludes('agreement signed by client') >= 0
      ? findByIncludes('agreement signed by client')
      : findByIncludes('signed by client');

    // Phone number to country code mapping function
    const extractCountryFromPhone = (phone: string): string => {
      if (!phone || typeof phone !== 'string') return '';
      const cleaned = phone.replace(/[\s\-\(\)]/g, '');
      
      // Country dial code mappings (sorted longest first for proper matching)
      const dialCodeMap: Record<string, string> = {
        '+263': 'ZW',  // Zimbabwe
        '+260': 'ZM',  // Zambia
        '+267': 'BW',  // Botswana
        '+258': 'MZ',  // Mozambique
        '+254': 'KE',  // Kenya
        '+251': 'ET',  // Ethiopia
        '+234': 'NG',  // Nigeria
        '+233': 'GH',  // Ghana
        '+351': 'PT',  // Portugal
        '+353': 'IE',  // Ireland
        '+966': 'SA',  // Saudi Arabia
        '+971': 'AE',  // United Arab Emirates
        '+65': 'SG',   // Singapore
        '+852': 'HK',  // Hong Kong
        '+64': 'NZ',   // New Zealand
        '+49': 'DE',   // Germany
        '+33': 'FR',   // France
        '+31': 'NL',   // Netherlands
        '+27': 'ZA',   // South Africa
        '+44': 'GB',   // United Kingdom
        '+61': 'AU',   // Australia
        '+1': 'US',    // United States (default for +1, could be CA)
      };
      
      // Sort by dial code length (longest first) to match most specific
      const sortedDialCodes = Object.keys(dialCodeMap).sort((a, b) => b.length - a.length);
      
      for (const dialCode of sortedDialCodes) {
        const noPlus = dialCode.replace('+', '');
        if (cleaned.startsWith(dialCode) || cleaned.startsWith(noPlus)) {
          return dialCodeMap[dialCode];
        }
      }
      return '';
    };

    // Find month columns (starting from column M onwards)
    const monthColumns: Array<{ index: number; month: string }> = [];
    for (let i = 0; i < hr.length; i++) {
      const header = hr[i] || '';
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
      const phoneNumber = phoneNumberIdx >= 0 ? (row[phoneNumberIdx] || '') : '';
      const rawCountryCode = (row[countryCodeIdx] || '').toUpperCase().trim();
      
      // Determine country code: prioritize Column D, fall back to phone number extraction
      let countryCode = rawCountryCode;
      // If Column D has a phone number pattern instead of ISO code, extract from phone
      if (!countryCode || countryCode.startsWith('+') || /^\d/.test(countryCode)) {
        const fromPhone = extractCountryFromPhone(phoneNumber || rawCountryCode);
        countryCode = fromPhone || 'UNKNOWN';
      }
      
      // Log UNKNOWN entries for debugging
      if (countryCode === 'UNKNOWN') {
        console.log(`[UNKNOWN] Stand ${standNumber}: Column D="${rawCountryCode}", Phone="${phoneNumber}"`);
      }
      
      const customerCategory = row[customerCategoryIdx] || '';
      const totalPrice = row[totalPriceIdx] || '0';
      const totalPaid = row[totalPaidIdx] || '0';
      const currentBalance = row[currentBalanceIdx] || '0';
      const progress = row[progressIdx] || '0';
      const monthlyPayment = row[monthlyPaymentIdx] || '0';
      
      // Parse boolean fields (TRUE/FALSE strings to boolean)
      const cellBool = (idx: number) =>
        idx >= 0 ? (row[idx] || '').toString().toUpperCase() === 'TRUE' : false;
      const offerReceived = cellBool(offerReceivedIdx);
      const initialPaymentCompleted = cellBool(initialPaymentCompletedIdx);
      const agreementRequested = cellBool(agreementRequestedIdx);
      const agreementSignedWarwickshire = cellBool(agreementSignedWarwickshireIdx);
      const agreementSignedClient = cellBool(agreementSignedClientIdx);

      // Determine if this is an unsold stand
      let isUnsold = !firstName && !lastName && !email;
      
      // Internal group stands should always be treated as sold, even if name/email are blank
      if (customerCategory && customerCategory.toLowerCase().includes('internal')) {
        isUnsold = false;
      }
      
      // Parse price for price range filtering
      const priceNumeric = parseFloat(totalPrice.replace(/[$,]/g, '')) || 0;

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

      // Calculate daysOverdue and prepaidDays based on overpayment logic
      const monthlyPaymentAmount = parseFloat(monthlyPayment.replace(/[$,]/g, '')) || 0;
      let totalPaymentsSum = 0;
      for (const payment of payments) {
        totalPaymentsSum += payment.amountNumeric;
      }
      
      // Calculate covered months using overpayment logic
      let coveredMonths = 0;
      if (monthlyPaymentAmount > 0) {
        coveredMonths = Math.floor(totalPaymentsSum / monthlyPaymentAmount);
      }
      
      // Find the base payment date from the first month column
      let basePaymentDate = new Date();
      if (monthColumns.length > 0) {
        const firstMonthHeader = monthColumns[0].month;
        const match = firstMonthHeader.match(/(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
        if (match) {
          const day = parseInt(match[1]);
          const monthName = match[2];
          const year = parseInt(match[3]);
          const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(monthName.toLowerCase());
          basePaymentDate = new Date(year, monthIndex, day);
        }
      }
      
      // Calculate next due date based on covered months
      const nextDueDate = new Date(basePaymentDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + coveredMonths);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDateNormalized = new Date(nextDueDate);
      dueDateNormalized.setHours(0, 0, 0, 0);
      
      let daysOverdue = 0;
      let prepaidDays = 0;
      
      if (!isUnsold && monthlyPaymentAmount > 0) {
        if (today > dueDateNormalized) {
          // Overdue - due date has passed
          daysOverdue = Math.floor((today.getTime() - dueDateNormalized.getTime()) / (1000 * 60 * 60 * 24));
        } else if (today < dueDateNormalized) {
          // Prepaid - due date is in the future
          prepaidDays = Math.floor((dueDateNormalized.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      allStands.push({
        standNumber,
        customerName: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        email,
        phoneNumber,
        countryCode,
        customerCategory,
        totalPrice,
        priceNumeric,
        totalPaid,
        currentBalance,
        progressPercentage: parseFloat(progress.replace('%', '')) || 0,
        monthlyPayment,
        isUnsold,
        offerReceived,
        initialPaymentCompleted,
        agreementRequested,
        agreementSignedWarwickshire,
        agreementSignedClient,
        payments,
        daysOverdue,
        prepaidDays,
        coveredMonths
      });
      
      // Log first few Internal category stands for debugging
      if (i <= 5 && customerCategory.toLowerCase().includes('internal')) {
        console.log(`Stand ${standNumber}: Category="${customerCategory}", Offer=${offerReceived}, Initial=${initialPaymentCompleted}, Requested=${agreementRequested}, SignedW=${agreementSignedWarwickshire}, SignedC=${agreementSignedClient}`);
      }
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
