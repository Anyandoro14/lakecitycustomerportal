import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * COMPLIANCE-CRITICAL: QC Enforcement for Receipt Processing
 * 
 * This edge function enforces mandatory QC controls for receipt posting.
 * Only receipts from the Receipts_Intake sheet that meet ALL approval conditions
 * will be processed. This is required for internal controls, accounting accuracy,
 * and compliance.
 * 
 * MANDATORY APPROVAL CONDITIONS (ALL must be true):
 * 1. Column C (Stand_Number): Must be present and match existing stand in Collection Schedule
 * 2. Column F (Payment_Amount): Must contain a valid numeric value > 0
 * 3. Column K (Intake_Status): Must read EXACTLY "Approved" (case-sensitive)
 * 
 * If ANY condition is not met, the receipt is IGNORED entirely and must not
 * affect any balances.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleSheetsResponse {
  values: string[][];
}

interface ApprovedReceipt {
  intake_id: string;
  timestamp: string;
  stand_number: string;
  customer_name: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  reference: string;
  receipt_url: string;
  entered_by: string;
  intake_status: string;
  notes: string;
}

interface RejectedReceipt {
  intake_id: string;
  stand_number: string;
  payment_amount: string;
  intake_status: string;
  rejection_reasons: string[];
}

interface ProcessingResult {
  success: boolean;
  approved_receipts: ApprovedReceipt[];
  rejected_receipts: RejectedReceipt[];
  summary: {
    total_receipts: number;
    approved_count: number;
    rejected_count: number;
    total_approved_amount: number;
  };
}

// Parse currency string to number
const parseCurrency = (val: string): number => {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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

// Fetch valid stand numbers from Collection Schedule
async function fetchValidStandNumbers(accessToken: string): Promise<Set<string>> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  // Get spreadsheet metadata to find the main collection sheet
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) {
    throw new Error('Failed to fetch spreadsheet metadata');
  }

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  
  // Find the main collection sheet (first sheet or RICHCRAFT CLIENT LIST)
  let sheetTitle = sheets[0]?.properties?.title || 'Sheet1';
  const richcraftSheet = sheets.find((s: any) => 
    s.properties.title.toUpperCase().includes('RICHCRAFT') || 
    s.properties.title.toUpperCase().includes('CLIENT LIST')
  );
  if (richcraftSheet) {
    sheetTitle = richcraftSheet.properties.title;
  }

  console.log(`Fetching valid stand numbers from sheet: "${sheetTitle}"`);

  // Fetch stand numbers from the collection schedule
  const range = encodeURIComponent(`${sheetTitle}!A:E`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch collection schedule data');
  }

  const data: GoogleSheetsResponse = await response.json();
  const rows = data.values || [];
  
  if (rows.length < 2) {
    return new Set();
  }

  const headers = rows[0];
  const standNumIndex = headers.findIndex(h => 
    h && h.toString().toLowerCase().includes('stand')
  );

  if (standNumIndex === -1) {
    throw new Error('Could not find Stand Number column in Collection Schedule');
  }

  const validStands = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const standNum = rows[i][standNumIndex]?.toString().trim();
    if (standNum) {
      validStands.add(standNum);
    }
  }

  console.log(`Found ${validStands.size} valid stand numbers in Collection Schedule`);
  return validStands;
}

// Fetch and validate receipts from Receipts_Intake sheet
async function fetchAndValidateReceipts(
  accessToken: string,
  validStands: Set<string>
): Promise<ProcessingResult> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  // Get spreadsheet metadata to find Receipts_Intake sheet
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) {
    throw new Error('Failed to fetch spreadsheet metadata');
  }

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  
  // Find the Receipts_Intake sheet (EXACT match required)
  const receiptsSheet = sheets.find((s: any) => 
    s.properties.title === 'Receipts_Intake'
  );

  if (!receiptsSheet) {
    throw new Error('Receipts_Intake sheet not found. This is the sole source of truth for receipts.');
  }

  const sheetTitle = receiptsSheet.properties.title;
  console.log(`Processing receipts from sheet: "${sheetTitle}"`);

  // Fetch all data from Receipts_Intake
  const range = encodeURIComponent(`${sheetTitle}!A:L`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Receipts_Intake data');
  }

  const data: GoogleSheetsResponse = await response.json();
  const rows = data.values || [];
  
  console.log(`Fetched ${rows.length} rows from Receipts_Intake`);

  if (rows.length < 2) {
    return {
      success: true,
      approved_receipts: [],
      rejected_receipts: [],
      summary: {
        total_receipts: 0,
        approved_count: 0,
        rejected_count: 0,
        total_approved_amount: 0
      }
    };
  }

  // Validate header row matches expected structure
  const headers = rows[0];
  console.log('Receipts_Intake headers:', headers);
  
  // Column indices based on the screenshot:
  // A: Intake_ID, B: Timestamp, C: Stand_Number, D: Customer_Name, 
  // E: Payment_Date, F: Payment_Amount, G: Payment_Method, H: Reference,
  // I: Receipt_URL, J: Entered_By, K: Intake_Status, L: Notes
  const COL_INTAKE_ID = 0;      // Column A
  const COL_TIMESTAMP = 1;      // Column B
  const COL_STAND_NUMBER = 2;   // Column C - MANDATORY
  const COL_CUSTOMER_NAME = 3;  // Column D
  const COL_PAYMENT_DATE = 4;   // Column E
  const COL_PAYMENT_AMOUNT = 5; // Column F - MANDATORY (must be > 0)
  const COL_PAYMENT_METHOD = 6; // Column G
  const COL_REFERENCE = 7;      // Column H
  const COL_RECEIPT_URL = 8;    // Column I
  const COL_ENTERED_BY = 9;     // Column J
  const COL_INTAKE_STATUS = 10; // Column K - MUST be exactly "Approved"
  const COL_NOTES = 11;         // Column L

  const approved_receipts: ApprovedReceipt[] = [];
  const rejected_receipts: RejectedReceipt[] = [];

  // Process each receipt row (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // Human-readable row number
    
    const intakeId = row[COL_INTAKE_ID]?.toString().trim() || `ROW_${rowNum}`;
    const standNumber = row[COL_STAND_NUMBER]?.toString().trim() || '';
    const paymentAmountStr = row[COL_PAYMENT_AMOUNT]?.toString().trim() || '';
    const intakeStatus = row[COL_INTAKE_STATUS]?.toString().trim() || '';
    
    const rejectionReasons: string[] = [];

    // =================================================================
    // MANDATORY CONDITION 1: Column C (Stand_Number) must be present
    // and must match an existing stand number in Collection Schedule
    // =================================================================
    if (!standNumber) {
      rejectionReasons.push('Stand Number (Column C) is missing');
    } else if (!validStands.has(standNumber)) {
      rejectionReasons.push(`Stand Number "${standNumber}" does not exist in Collection Schedule`);
    }

    // =================================================================
    // MANDATORY CONDITION 2: Column F (Payment_Amount) must contain
    // a valid numeric value greater than zero
    // =================================================================
    const paymentAmount = parseCurrency(paymentAmountStr);
    if (!paymentAmountStr) {
      rejectionReasons.push('Payment Amount (Column F) is missing');
    } else if (paymentAmount <= 0) {
      rejectionReasons.push(`Payment Amount must be greater than zero (got: "${paymentAmountStr}")`);
    }

    // =================================================================
    // MANDATORY CONDITION 3: Column K (Intake_Status) must read
    // EXACTLY "Approved" (case-sensitive)
    // No other value is acceptable (e.g., Pending, Yes, TRUE, etc.)
    // =================================================================
    if (intakeStatus !== 'Approved') {
      if (!intakeStatus) {
        rejectionReasons.push('Approval Status (Column K) is missing');
      } else {
        rejectionReasons.push(`Approval Status must be exactly "Approved" (got: "${intakeStatus}")`);
      }
    }

    // =================================================================
    // COMPLIANCE DECISION: If ANY condition fails, REJECT the receipt
    // =================================================================
    if (rejectionReasons.length > 0) {
      console.log(`[REJECTED] Row ${rowNum} (${intakeId}): ${rejectionReasons.join('; ')}`);
      rejected_receipts.push({
        intake_id: intakeId,
        stand_number: standNumber,
        payment_amount: paymentAmountStr,
        intake_status: intakeStatus,
        rejection_reasons: rejectionReasons
      });
      continue;
    }

    // =================================================================
    // ALL CONDITIONS MET: Receipt is APPROVED for processing
    // =================================================================
    console.log(`[APPROVED] Row ${rowNum} (${intakeId}): Stand ${standNumber}, Amount ${paymentAmount}`);
    
    approved_receipts.push({
      intake_id: intakeId,
      timestamp: row[COL_TIMESTAMP]?.toString().trim() || '',
      stand_number: standNumber,
      customer_name: row[COL_CUSTOMER_NAME]?.toString().trim() || '',
      payment_date: row[COL_PAYMENT_DATE]?.toString().trim() || '',
      payment_amount: paymentAmount,
      payment_method: row[COL_PAYMENT_METHOD]?.toString().trim() || '',
      reference: row[COL_REFERENCE]?.toString().trim() || '',
      receipt_url: row[COL_RECEIPT_URL]?.toString().trim() || '',
      entered_by: row[COL_ENTERED_BY]?.toString().trim() || '',
      intake_status: intakeStatus,
      notes: row[COL_NOTES]?.toString().trim() || ''
    });
  }

  const totalApprovedAmount = approved_receipts.reduce((sum, r) => sum + r.payment_amount, 0);

  return {
    success: true,
    approved_receipts,
    rejected_receipts,
    summary: {
      total_receipts: rows.length - 1, // Exclude header
      approved_count: approved_receipts.length,
      rejected_count: rejected_receipts.length,
      total_approved_amount: totalApprovedAmount
    }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('='.repeat(60));
    console.log('COMPLIANCE: QC Enforcement for Receipt Processing');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${new Date().toISOString()}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Google Sheets access token
    console.log('Authenticating with Google Sheets...');
    const accessToken = await getGoogleAccessToken();

    // Step 1: Fetch valid stand numbers from Collection Schedule
    console.log('Step 1: Fetching valid stand numbers from Collection Schedule...');
    const validStands = await fetchValidStandNumbers(accessToken);

    // Step 2: Fetch and validate receipts from Receipts_Intake
    console.log('Step 2: Processing receipts from Receipts_Intake (sole source of truth)...');
    const result = await fetchAndValidateReceipts(accessToken, validStands);

    // Log compliance summary
    console.log('='.repeat(60));
    console.log('COMPLIANCE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Receipts Processed: ${result.summary.total_receipts}`);
    console.log(`Approved (passed QC): ${result.summary.approved_count}`);
    console.log(`Rejected (failed QC): ${result.summary.rejected_count}`);
    console.log(`Total Approved Amount: $${result.summary.total_approved_amount.toFixed(2)}`);
    console.log('='.repeat(60));

    if (result.rejected_receipts.length > 0) {
      console.log('REJECTED RECEIPTS DETAIL:');
      for (const rejected of result.rejected_receipts) {
        console.log(`  - ${rejected.intake_id}: ${rejected.rejection_reasons.join('; ')}`);
      }
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('QC Processing Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        message: 'Receipt processing failed. No receipts were posted.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
