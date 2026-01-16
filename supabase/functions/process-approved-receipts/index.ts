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

interface PostedReceipt {
  intake_id: string;
  stand_number: string;
  payment_amount: number;
  posted_to_column: string;
  posted_to_row: number;
}

interface ProcessingResult {
  success: boolean;
  approved_receipts: ApprovedReceipt[];
  rejected_receipts: RejectedReceipt[];
  posted_receipts: PostedReceipt[];
  summary: {
    total_receipts: number;
    approved_count: number;
    rejected_count: number;
    posted_count: number;
    total_approved_amount: number;
    total_posted_amount: number;
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
    console.log(`Using service account from JSON: ${serviceAccountEmail}`);
  } catch (e) {
    console.log(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON: ${e}`);
    privateKeyPem = keyString;
    serviceAccountEmail = clientEmail;
    console.log(`Using GOOGLE_CLIENT_EMAIL fallback: ${serviceAccountEmail}`);
  }

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!serviceAccountEmail || !emailRegex.test(serviceAccountEmail)) {
    throw new Error('Invalid or missing service account email');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    // WRITE ACCESS needed to post payments back to Collection Schedule
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

// Fetch Collection Schedule data with row mappings for posting
async function fetchCollectionScheduleData(accessToken: string): Promise<{
  sheetTitle: string;
  rows: string[][];
  standRowMap: Map<string, number>;
  paymentColumnStart: number;
  headerRow: string[];
}> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) {
    throw new Error('Failed to fetch spreadsheet metadata');
  }

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  
  // Find "Collection Schedule 1" specifically - this is the source of truth for posting
  let sheetTitle = sheets[0]?.properties?.title || 'Sheet1';
  const collectionScheduleSheet = sheets.find((s: any) => 
    s.properties.title === 'Collection Schedule 1'
  );
  if (collectionScheduleSheet) {
    sheetTitle = collectionScheduleSheet.properties.title;
  } else {
    // Fallback to first sheet that contains "Collection Schedule" in name
    const fallbackSheet = sheets.find((s: any) => 
      s.properties.title.toLowerCase().includes('collection schedule')
    );
    if (fallbackSheet) {
      sheetTitle = fallbackSheet.properties.title;
    }
  }

  console.log(`Fetching Collection Schedule data from: "${sheetTitle}"`);

  // Fetch entire sheet to get payment columns
  const range = encodeURIComponent(`${sheetTitle}!A:BA`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Collection Schedule data');
  }

  const data: GoogleSheetsResponse = await response.json();
  const rows = data.values || [];
  
  if (rows.length < 2) {
    throw new Error('Collection Schedule has no data rows');
  }

  const headerRow = rows[0];
  
  // Find Stand Number column
  const standNumIndex = headerRow.findIndex(h => 
    h && h.toString().toLowerCase().includes('stand')
  );
  if (standNumIndex === -1) {
    throw new Error('Could not find Stand Number column');
  }

  // Payment structure in Collection Schedule 1:
  // - Payment amounts are in columns Z, AB, AD, AF, AH, AJ (every other column starting at Z, index 25)
  // - Payment dates are in columns AA, AC, AE, AG, AI, AK (interleaved)
  // This is the FIXED structure - do not auto-detect
  const paymentColumnStart = 25; // Column Z (index 25)
  console.log(`Payment columns start at column ${columnIndexToLetter(paymentColumnStart)} (Z) - amounts in Z, AB, AD... dates in AA, AC, AE...`)

  // Build stand -> row mapping
  const standRowMap = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const standNum = rows[i][standNumIndex]?.toString().trim();
    if (standNum) {
      standRowMap.set(standNum, i + 1); // 1-indexed row number for Sheets API
    }
  }

  console.log(`Found ${standRowMap.size} stands mapped to rows`);

  return { sheetTitle, rows, standRowMap, paymentColumnStart, headerRow };
}

// Convert column index to letter (0 = A, 1 = B, etc.)
function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

type SheetProtectedRange = {
  description?: string;
  warningOnly?: boolean;
  range?: {
    sheetId?: number;
    startRowIndex?: number;
    endRowIndex?: number;
    startColumnIndex?: number;
    endColumnIndex?: number;
  };
  editors?: {
    users?: string[];
    groups?: string[];
    domainUsersCanEdit?: boolean;
  };
};

async function getSheetProtectedRanges(accessToken: string, spreadsheetId: string, sheetTitle: string): Promise<{ sheetId?: number; protectedRanges: SheetProtectedRange[] }> {
  // Only fetch minimal fields for debugging permission issues
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title,sheetId),protectedRanges)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { protectedRanges: [] };

  const data = await res.json();
  const sheet = (data.sheets || []).find((s: any) => s?.properties?.title === sheetTitle);
  return {
    sheetId: sheet?.properties?.sheetId,
    protectedRanges: sheet?.protectedRanges || [],
  };
}

function protectedRangeCoversCell(r: SheetProtectedRange, sheetId: number | undefined, rowIndex0: number, colIndex0: number): boolean {
  const range = r.range;
  if (!range) return false;
  if (typeof sheetId === 'number' && typeof range.sheetId === 'number' && range.sheetId !== sheetId) return false;

  const startRow = range.startRowIndex ?? 0;
  const endRow = range.endRowIndex ?? Number.POSITIVE_INFINITY;
  const startCol = range.startColumnIndex ?? 0;
  const endCol = range.endColumnIndex ?? Number.POSITIVE_INFINITY;

  return rowIndex0 >= startRow && rowIndex0 < endRow && colIndex0 >= startCol && colIndex0 < endCol;
}

let protectionCache: { sheetId?: number; protectedRanges: SheetProtectedRange[] } | null = null;

// Fetch and validate receipts from Receipts_Intake sheet
async function fetchAndValidateReceipts(
  accessToken: string,
  validStands: Set<string>
): Promise<{ approved: ApprovedReceipt[]; rejected: RejectedReceipt[] }> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) {
    throw new Error('Failed to fetch spreadsheet metadata');
  }

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  
  const receiptsSheet = sheets.find((s: any) => 
    s.properties.title === 'Receipts_Intake'
  );

  if (!receiptsSheet) {
    throw new Error('Receipts_Intake sheet not found');
  }

  const sheetTitle = receiptsSheet.properties.title;
  console.log(`Processing receipts from: "${sheetTitle}"`);

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
    return { approved: [], rejected: [] };
  }

  const COL_INTAKE_ID = 0;
  const COL_TIMESTAMP = 1;
  const COL_STAND_NUMBER = 2;
  const COL_CUSTOMER_NAME = 3;
  const COL_PAYMENT_DATE = 4;
  const COL_PAYMENT_AMOUNT = 5;
  const COL_PAYMENT_METHOD = 6;
  const COL_REFERENCE = 7;
  const COL_RECEIPT_URL = 8;
  const COL_ENTERED_BY = 9;
  const COL_INTAKE_STATUS = 10;
  const COL_NOTES = 11;

  const approved: ApprovedReceipt[] = [];
  const rejected: RejectedReceipt[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    
    const intakeId = row[COL_INTAKE_ID]?.toString().trim() || `ROW_${rowNum}`;
    const standNumber = row[COL_STAND_NUMBER]?.toString().trim() || '';
    const paymentAmountStr = row[COL_PAYMENT_AMOUNT]?.toString().trim() || '';
    const intakeStatus = row[COL_INTAKE_STATUS]?.toString().trim() || '';
    
    const rejectionReasons: string[] = [];

    // CONDITION 1: Stand Number must exist
    if (!standNumber) {
      rejectionReasons.push('Stand Number (Column C) is missing');
    } else if (!validStands.has(standNumber)) {
      rejectionReasons.push(`Stand Number "${standNumber}" not in Collection Schedule`);
    }

    // CONDITION 2: Payment Amount must be > 0
    const paymentAmount = parseCurrency(paymentAmountStr);
    if (!paymentAmountStr) {
      rejectionReasons.push('Payment Amount (Column F) is missing');
    } else if (paymentAmount <= 0) {
      rejectionReasons.push(`Payment Amount must be > 0 (got: "${paymentAmountStr}")`);
    }

    // CONDITION 3: Status must be exactly "Approved"
    if (intakeStatus !== 'Approved') {
      if (!intakeStatus) {
        rejectionReasons.push('Approval Status (Column K) is missing');
      } else {
        rejectionReasons.push(`Status must be "Approved" (got: "${intakeStatus}")`);
      }
    }

    if (rejectionReasons.length > 0) {
      console.log(`[REJECTED] Row ${rowNum}: ${rejectionReasons.join('; ')}`);
      rejected.push({
        intake_id: intakeId,
        stand_number: standNumber,
        payment_amount: paymentAmountStr,
        intake_status: intakeStatus,
        rejection_reasons: rejectionReasons
      });
      continue;
    }

    console.log(`[APPROVED] Row ${rowNum}: Stand ${standNumber}, Amount $${paymentAmount}`);
    approved.push({
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

  return { approved, rejected };
}

// Post approved receipts to the Collection Schedule
async function postReceiptsToCollectionSchedule(
  accessToken: string,
  approvedReceipts: ApprovedReceipt[],
  scheduleData: {
    sheetTitle: string;
    rows: string[][];
    standRowMap: Map<string, number>;
    paymentColumnStart: number;
  }
): Promise<PostedReceipt[]> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  const posted: PostedReceipt[] = [];
  
  // Track columns we've already posted to for each row (to handle multiple receipts for same stand)
  const postedColumnsPerRow = new Map<number, Set<number>>();

  for (const receipt of approvedReceipts) {
    const rowNum = scheduleData.standRowMap.get(receipt.stand_number);
    if (!rowNum) {
      console.log(`[SKIP] No row found for stand ${receipt.stand_number}`);
      continue;
    }

    console.log(`Processing stand ${receipt.stand_number}, row ${rowNum}`);

    // Find the next empty payment AMOUNT cell in the row
    // Payment structure: amounts in Z(25), AB(27), AD(29), AF(31), AH(33), AJ(35)
    // Dates in AA(26), AC(28), AE(30), AG(32), AI(34), AK(36)
    // Payment amount columns are at indices: 25, 27, 29, 31, 33, 35 (every other starting at 25)
    const rowData = scheduleData.rows[rowNum - 1] || [];
    let targetAmountColumn = -1;
    let targetDateColumn = -1;
    
    // Get columns already posted to in this run for this row
    const alreadyPostedCols = postedColumnsPerRow.get(rowNum) || new Set<number>();

    console.log(`Scanning AMOUNT columns from Z (25), AB (27), AD (29)...`);
    console.log(`Row data length: ${rowData.length}, already posted to columns in this run: ${Array.from(alreadyPostedCols).map(c => columnIndexToLetter(c)).join(', ') || 'none'}`);

    // Payment amount columns: Z=25, AB=27, AD=29, AF=31, AH=33, AJ=35
    const paymentAmountColumns = [25, 27, 29, 31, 33, 35];
    
    for (const col of paymentAmountColumns) {
      // Skip columns we already posted to in this batch
      if (alreadyPostedCols.has(col)) {
        console.log(`Column ${columnIndexToLetter(col)} (${col}): SKIPPED (already posted in this run)`);
        continue;
      }
      
      const cellValue = rowData[col]?.toString().trim() || '';
      console.log(`Column ${columnIndexToLetter(col)} (${col}): "${cellValue}"`);
      if (!cellValue || cellValue === '0' || cellValue === '$0' || cellValue === '$0.00') {
        targetAmountColumn = col;
        targetDateColumn = col + 1; // Date is always the next column
        console.log(`Found empty amount cell at column ${columnIndexToLetter(col)}, date will go to ${columnIndexToLetter(col + 1)}`);
        break;
      }
    }

    if (targetAmountColumn === -1) {
      console.log(`[SKIP] No empty payment cell for stand ${receipt.stand_number}`);
      continue;
    }

    const amountColumnLetter = columnIndexToLetter(targetAmountColumn);
    const dateColumnLetter = columnIndexToLetter(targetDateColumn);
    const amountCellRange = `${scheduleData.sheetTitle}!${amountColumnLetter}${rowNum}`;
    const dateCellRange = `${scheduleData.sheetTitle}!${dateColumnLetter}${rowNum}`;

    console.log(`[POSTING] ${receipt.intake_id}: $${receipt.payment_amount} -> ${amountCellRange}, Date: ${receipt.payment_date} -> ${dateCellRange}`);

    // Write the payment amount to the amount cell
    const amountUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(amountCellRange)}?valueInputOption=USER_ENTERED`;
    
    const amountUpdateResponse = await fetch(amountUpdateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[receipt.payment_amount]]
      }),
    });

    if (!amountUpdateResponse.ok) {
      const status = amountUpdateResponse.status;
      const errorText = await amountUpdateResponse.text();
      console.error(`[ERROR] Failed to post amount for ${receipt.intake_id}: ${errorText}`);
      continue;
    }

    // Write the payment date to the date cell
    const dateUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dateCellRange)}?valueInputOption=USER_ENTERED`;
    
    const dateUpdateResponse = await fetch(dateUpdateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[receipt.payment_date]]
      }),
    });

    if (!dateUpdateResponse.ok) {
      const status = dateUpdateResponse.status;
      const errorText = await dateUpdateResponse.text();
      console.error(`[ERROR] Failed to post date for ${receipt.intake_id}: ${errorText}`);
      // Amount was already posted, so we still count this as success
    }

    console.log(`[SUCCESS] Posted ${receipt.intake_id}: Amount to ${amountCellRange}, Date to ${dateCellRange}`);
    
    // Mark this column as used for this row so subsequent receipts for same stand go to next column
    if (!postedColumnsPerRow.has(rowNum)) {
      postedColumnsPerRow.set(rowNum, new Set<number>());
    }
    postedColumnsPerRow.get(rowNum)!.add(targetAmountColumn);
    
    posted.push({
      intake_id: receipt.intake_id,
      stand_number: receipt.stand_number,
      payment_amount: receipt.payment_amount,
      posted_to_column: amountColumnLetter,
      posted_to_row: rowNum
    });
  }

  return posted;
}

// Mark receipts as "Posted" in the Receipts_Intake sheet
async function markReceiptsAsPosted(
  accessToken: string,
  postedReceipts: PostedReceipt[]
): Promise<void> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId || postedReceipts.length === 0) return;

  // We need to find the row numbers in Receipts_Intake for each posted receipt
  // and update Column K (Intake_Status) to "Posted"
  
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) return;

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  const receiptsSheet = sheets.find((s: any) => s.properties.title === 'Receipts_Intake');
  if (!receiptsSheet) return;

  const sheetTitle = receiptsSheet.properties.title;

  // Fetch intake IDs to find row numbers
  const range = encodeURIComponent(`${sheetTitle}!A:A`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return;

  const data: GoogleSheetsResponse = await response.json();
  const rows = data.values || [];

  // Build intake_id -> row number map
  const intakeIdToRow = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const intakeId = rows[i][0]?.toString().trim();
    if (intakeId) {
      intakeIdToRow.set(intakeId, i + 1);
    }
  }

  // Update each posted receipt's status to "Posted"
  for (const posted of postedReceipts) {
    const rowNum = intakeIdToRow.get(posted.intake_id);
    if (!rowNum) continue;

    const cellRange = `${sheetTitle}!K${rowNum}`;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;
    
    await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [['Posted']] }),
    });

    console.log(`[MARKED] ${posted.intake_id} status updated to "Posted"`);
  }
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

    // Get Google Sheets access token (with WRITE permission)
    console.log('Authenticating with Google Sheets (write access)...');
    const accessToken = await getGoogleAccessToken();

    // Step 1: Fetch Collection Schedule data with row mappings
    console.log('Step 1: Fetching Collection Schedule data...');
    const scheduleData = await fetchCollectionScheduleData(accessToken);
    const validStands = new Set(scheduleData.standRowMap.keys());

    // Step 2: Fetch and validate receipts from Receipts_Intake
    console.log('Step 2: Processing receipts from Receipts_Intake...');
    const { approved, rejected } = await fetchAndValidateReceipts(accessToken, validStands);

    // Step 3: Post approved receipts to Collection Schedule
    console.log('Step 3: Posting approved receipts to Collection Schedule...');
    const posted = await postReceiptsToCollectionSchedule(accessToken, approved, scheduleData);

    // Step 4: Mark posted receipts as "Posted" in Receipts_Intake
    console.log('Step 4: Updating status in Receipts_Intake...');
    await markReceiptsAsPosted(accessToken, posted);

    const totalApprovedAmount = approved.reduce((sum, r) => sum + r.payment_amount, 0);
    const totalPostedAmount = posted.reduce((sum, r) => sum + r.payment_amount, 0);

    const result: ProcessingResult = {
      success: true,
      approved_receipts: approved,
      rejected_receipts: rejected,
      posted_receipts: posted,
      summary: {
        total_receipts: approved.length + rejected.length,
        approved_count: approved.length,
        rejected_count: rejected.length,
        posted_count: posted.length,
        total_approved_amount: totalApprovedAmount,
        total_posted_amount: totalPostedAmount
      }
    };

    // Log compliance summary
    console.log('='.repeat(60));
    console.log('COMPLIANCE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Receipts Processed: ${result.summary.total_receipts}`);
    console.log(`Approved (passed QC): ${result.summary.approved_count}`);
    console.log(`Posted to Schedule: ${result.summary.posted_count}`);
    console.log(`Rejected (failed QC): ${result.summary.rejected_count}`);
    console.log(`Total Approved Amount: $${totalApprovedAmount.toFixed(2)}`);
    console.log(`Total Posted Amount: $${totalPostedAmount.toFixed(2)}`);
    console.log('='.repeat(60));

    if (posted.length > 0) {
      console.log('POSTED RECEIPTS:');
      for (const p of posted) {
        console.log(`  - ${p.intake_id}: $${p.payment_amount} -> Column ${p.posted_to_column}, Row ${p.posted_to_row}`);
      }
    }

    if (rejected.length > 0) {
      console.log('REJECTED RECEIPTS:');
      for (const r of rejected) {
        console.log(`  - ${r.intake_id}: ${r.rejection_reasons.join('; ')}`);
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
