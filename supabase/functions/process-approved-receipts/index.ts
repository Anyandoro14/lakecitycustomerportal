import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import {
  DEFAULT_PAYMENT_PLAN_MONTHS,
  listCollectionScheduleDataTabTitles,
  parseCollectionScheduleTabMonths,
  paymentColumnBounds,
  resolveCollectionScheduleSheetTitle,
} from "../_shared/collection-schedule-sheets.ts";

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
 * 3. Column K (Intake_Status): Must read "Approved" (case-insensitive)
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

/** Union of stand numbers across all Collection Schedule - N Months tabs (and legacy tab). */
async function fetchValidStandNumbersFromAllCollectionTabs(
  accessToken: string,
  spreadsheetId: string,
  sheets: { properties?: { title?: string } }[],
): Promise<Set<string>> {
  const tabTitles = listCollectionScheduleDataTabTitles(sheets as { properties: { title?: string } }[]);
  const validStands = new Set<string>();

  for (const sheetTitle of tabTitles) {
    const range = encodeURIComponent(`${sheetTitle}!A:E`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.warn(`Could not read tab "${sheetTitle}" for stand list`);
      continue;
    }

    const data: GoogleSheetsResponse = await response.json();
    const rows = data.values || [];
    if (rows.length < 2) continue;

    const headers = rows[0];
    const standNumIndex = headers.findIndex((h) =>
      h && h.toString().toLowerCase().includes('stand')
    );
    if (standNumIndex === -1) continue;

    for (let i = 1; i < rows.length; i++) {
      const standNum = rows[i][standNumIndex]?.toString().trim();
      if (standNum) validStands.add(standNum);
    }
  }

  console.log(`Found ${validStands.size} valid stand numbers across ${tabTitles.length} collection tab(s)`);
  return validStands;
}

// Fetch one Collection Schedule tab with row mappings for posting
async function fetchCollectionScheduleData(
  accessToken: string,
  sheetTitle: string,
  paymentPlanMonths: number,
): Promise<{
  sheetTitle: string;
  rows: string[][];
  standRowMap: Map<string, number>;
  paymentColumnStart: number;
  paymentColumnEnd: number;
  headerRow: string[];
}> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  console.log(`Fetching Collection Schedule data from: "${sheetTitle}" (${paymentPlanMonths} mo)`);

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

  const standNumIndex = headerRow.findIndex((h) =>
    h && h.toString().toLowerCase().includes('stand')
  );
  if (standNumIndex === -1) {
    throw new Error('Could not find Stand Number column');
  }

  const { start: paymentColumnStart, end: paymentColumnEnd } = paymentColumnBounds(paymentPlanMonths);
  console.log(
    `Payment columns: index ${paymentColumnStart} through ${paymentColumnEnd} (${paymentPlanMonths} months)`,
  );

  const standRowMap = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const standNum = rows[i][standNumIndex]?.toString().trim();
    if (standNum) {
      standRowMap.set(standNum, i + 1);
    }
  }

  console.log(`Found ${standRowMap.size} stands mapped to rows`);

  return { sheetTitle, rows, standRowMap, paymentColumnStart, paymentColumnEnd, headerRow };
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

    // CONDITION 3: Status must be "Approved" (case-insensitive)
    if (intakeStatus.toLowerCase() !== 'approved') {
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

    const paymentDateRaw = row[COL_PAYMENT_DATE]?.toString().trim() || '';
    console.log(`[APPROVED] Row ${rowNum}: Stand ${standNumber}, Amount $${paymentAmount}, Payment Date: "${paymentDateRaw}"`);
    approved.push({
      intake_id: intakeId,
      timestamp: row[COL_TIMESTAMP]?.toString().trim() || '',
      stand_number: standNumber,
      customer_name: row[COL_CUSTOMER_NAME]?.toString().trim() || '',
      payment_date: paymentDateRaw,
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

// Parse a date string to Date object (handles various formats)
function parseReceiptDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  const trimmed = dateStr.trim();
  
  // Try standard Date parsing first (handles ISO format and most standard formats)
  let parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Try DD/MM/YYYY or DD-MM-YYYY format (common in spreadsheets)
  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1; // 0-indexed month
    const year = parseInt(ddmmyyyyMatch[3], 10);
    parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Try MM/DD/YYYY or MM-DD-YYYY format
  const mmddyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mmddyyyyMatch) {
    const month = parseInt(mmddyyyyMatch[1], 10) - 1;
    const day = parseInt(mmddyyyyMatch[2], 10);
    const year = parseInt(mmddyyyyMatch[3], 10);
    // Only use this if the day value seems like a valid day
    if (day <= 31 && month <= 11) {
      parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  
  // Try YYYY-MM-DD format
  const yyyymmddMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1], 10);
    const month = parseInt(yyyymmddMatch[2], 10) - 1;
    const day = parseInt(yyyymmddMatch[3], 10);
    parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Try "Month Day, Year" or "Day Month Year" formats
  parsed = new Date(Date.parse(trimmed));
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  console.log(`[DATE PARSE FAILED] Could not parse date: "${dateStr}"`);
  return null;
}

// Get the column index for a given month
// Column M (12) = September 2025, N (13) = October 2025, etc.
function getMonthColumnIndex(paymentDate: Date, baseDate: Date, paymentColumnStart: number, paymentColumnEnd: number): number {
  // Calculate months difference from base date (September 2025 = Column M = index 12)
  const baseYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth();
  const payYear = paymentDate.getFullYear();
  const payMonth = paymentDate.getMonth();
  
  const monthsDiff = (payYear - baseYear) * 12 + (payMonth - baseMonth);
  const targetColumn = paymentColumnStart + monthsDiff;
  
  // Ensure we're within the valid payment column range
  if (targetColumn < paymentColumnStart || targetColumn > paymentColumnEnd) {
    return -1; // Out of range
  }
  
  return targetColumn;
}

// Post approved receipts to the Collection Schedule
// ENHANCED: Supports monthly aggregation - adds to existing cell value if payment falls in same month
async function postReceiptsToCollectionSchedule(
  accessToken: string,
  approvedReceipts: ApprovedReceipt[],
  scheduleData: {
    sheetTitle: string;
    rows: string[][];
    standRowMap: Map<string, number>;
    paymentColumnStart: number;
    paymentColumnEnd: number;
    headerRow: string[];
  }
): Promise<PostedReceipt[]> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured');
  }

  const posted: PostedReceipt[] = [];
  const paymentColumnEnd = scheduleData.paymentColumnEnd;

  // Parse the base date from the first payment column header (Column M)
  // This is the reference point for calculating which column corresponds to which month
  let baseDate = new Date(2025, 8, 5); // Default: September 5, 2025
  const firstPaymentHeader = scheduleData.headerRow[scheduleData.paymentColumnStart];
  if (firstPaymentHeader) {
    const parsedHeaderDate = new Date(firstPaymentHeader);
    if (!isNaN(parsedHeaderDate.getTime())) {
      baseDate = parsedHeaderDate;
    }
  }
  console.log(`Base date for payment columns: ${baseDate.toLocaleDateString()}`);
  
  // Track cell updates for each stand/column combination
  // Map of "row-col" -> { existingValue, newValue }
  const cellUpdates = new Map<string, { rowNum: number; col: number; currentValue: number; addedAmount: number }>();
  
  // Group receipts by stand and month for proper aggregation
  for (const receipt of approvedReceipts) {
    const rowNum = scheduleData.standRowMap.get(receipt.stand_number);
    if (!rowNum) {
      console.log(`[SKIP] No row found for stand ${receipt.stand_number}`);
      continue;
    }

    console.log(`Processing stand ${receipt.stand_number}, row ${rowNum}, payment_date: ${receipt.payment_date}`);

    // Parse the receipt's payment date to determine which month it belongs to
    const paymentDate = parseReceiptDate(receipt.payment_date);
    let targetColumn: number;
    
    if (paymentDate) {
      // Receipt has a valid date - find the corresponding month column
      targetColumn = getMonthColumnIndex(paymentDate, baseDate, scheduleData.paymentColumnStart, paymentColumnEnd);
      
      if (targetColumn === -1) {
        // Date is outside the range of payment columns - fallback to next empty cell
        console.log(`[FALLBACK] Payment date ${receipt.payment_date} is outside column range, using next empty cell`);
        targetColumn = findNextEmptyColumn(scheduleData.rows[rowNum - 1] || [], scheduleData.paymentColumnStart, paymentColumnEnd, cellUpdates, rowNum);
      } else {
        console.log(`[MAPPED] Payment date ${receipt.payment_date} maps to column ${columnIndexToLetter(targetColumn)} (month: ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })})`);
      }
    } else {
      // No valid date - use next empty cell (existing behavior)
      console.log(`[FALLBACK] No valid payment date for ${receipt.intake_id}, using next empty cell`);
      targetColumn = findNextEmptyColumn(scheduleData.rows[rowNum - 1] || [], scheduleData.paymentColumnStart, paymentColumnEnd, cellUpdates, rowNum);
    }

    if (targetColumn === -1) {
      console.log(`[SKIP] No valid target column for stand ${receipt.stand_number}`);
      continue;
    }

    const cellKey = `${rowNum}-${targetColumn}`;
    const rowData = scheduleData.rows[rowNum - 1] || [];
    
    // Get existing value in the cell
    let existingValue = 0;
    if (cellUpdates.has(cellKey)) {
      // We've already processed this cell in this batch
      const update = cellUpdates.get(cellKey)!;
      existingValue = update.currentValue + update.addedAmount;
    } else {
      // Check the actual sheet value
      const cellValueStr = rowData[targetColumn]?.toString().trim() || '';
      if (cellValueStr && cellValueStr !== '0' && cellValueStr !== '$0' && cellValueStr !== '$0.00') {
        existingValue = parseCurrency(cellValueStr);
      }
    }

    // Calculate new total (existing + new receipt)
    const newTotal = existingValue + receipt.payment_amount;
    
    console.log(`[AGGREGATION] ${receipt.intake_id}: Existing=${existingValue}, Adding=${receipt.payment_amount}, NewTotal=${newTotal}`);

    // Track this update
    if (cellUpdates.has(cellKey)) {
      const update = cellUpdates.get(cellKey)!;
      update.addedAmount += receipt.payment_amount;
    } else {
      cellUpdates.set(cellKey, {
        rowNum,
        col: targetColumn,
        currentValue: existingValue > 0 ? existingValue : 0,
        addedAmount: receipt.payment_amount
      });
    }

    // Record for return value - will update with actual posted column after writing
    posted.push({
      intake_id: receipt.intake_id,
      stand_number: receipt.stand_number,
      payment_amount: receipt.payment_amount,
      posted_to_column: columnIndexToLetter(targetColumn),
      posted_to_row: rowNum
    });
  }

  // Now write all the aggregated values to the sheet
  console.log(`Writing ${cellUpdates.size} cell updates to sheet...`);
  
  for (const [cellKey, update] of cellUpdates) {
    const finalValue = update.currentValue + update.addedAmount;
    const columnLetter = columnIndexToLetter(update.col);
    const cellRange = `${scheduleData.sheetTitle}!${columnLetter}${update.rowNum}`;

    console.log(`[POSTING] ${cellRange}: ${update.currentValue} + ${update.addedAmount} = ${finalValue}`);

    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[finalValue]]
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[ERROR] Failed to update ${cellRange}: ${errorText}`);
    } else {
      console.log(`[SUCCESS] Updated ${cellRange} to ${finalValue}`);
    }
  }

  return posted;
}

// Helper function to find next empty column (fallback for receipts without valid dates)
function findNextEmptyColumn(
  rowData: string[],
  paymentColumnStart: number,
  paymentColumnEnd: number,
  cellUpdates: Map<string, { rowNum: number; col: number; currentValue: number; addedAmount: number }>,
  rowNum: number
): number {
  for (let col = paymentColumnStart; col <= paymentColumnEnd; col++) {
    const cellKey = `${rowNum}-${col}`;
    
    // Skip if we already have pending updates for this cell
    if (cellUpdates.has(cellKey)) {
      continue;
    }
    
    const cellValue = rowData[col]?.toString().trim() || '';
    if (!cellValue || cellValue === '0' || cellValue === '$0' || cellValue === '$0.00') {
      return col;
    }
  }
  return -1; // No empty column found
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID not configured');
    }

    // Get Google Sheets access token (with WRITE permission)
    console.log('Authenticating with Google Sheets (write access)...');
    const accessToken = await getGoogleAccessToken();

    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metadataResponse.ok) {
      throw new Error('Failed to fetch spreadsheet metadata');
    }
    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];

    // Step 1: Valid stands = union across all collection schedule tabs
    console.log('Step 1: Loading stand numbers from all Collection Schedule tabs...');
    const validStands = await fetchValidStandNumbersFromAllCollectionTabs(
      accessToken,
      spreadsheetId,
      sheets,
    );

    // Step 2: Fetch and validate receipts from Receipts_Intake
    console.log('Step 2: Processing receipts from Receipts_Intake...');
    const { approved, rejected } = await fetchAndValidateReceipts(accessToken, validStands);

    const { data: profileRows } = await supabase
      .from('profiles')
      .select('stand_number, payment_plan_months')
      .not('stand_number', 'is', null);

    const standToMonths = new Map<string, number>();
    for (const p of profileRows || []) {
      const sn = p.stand_number?.toString().trim().toUpperCase();
      if (!sn) continue;
      const m =
        p.payment_plan_months != null && p.payment_plan_months > 0
          ? Math.round(Number(p.payment_plan_months))
          : DEFAULT_PAYMENT_PLAN_MONTHS;
      standToMonths.set(sn, m);
    }

    // Step 3: Post per tab (group receipts by resolved Collection Schedule tab)
    console.log('Step 3: Posting approved receipts to Collection Schedule...');
    const posted: PostedReceipt[] = [];

    const groups = new Map<string, ApprovedReceipt[]>();
    for (const rec of approved) {
      const sn = rec.stand_number?.toString().trim().toUpperCase() || '';
      const months = standToMonths.get(sn) ?? DEFAULT_PAYMENT_PLAN_MONTHS;
      const resolved = resolveCollectionScheduleSheetTitle(sheets, {
        paymentPlanMonths: months,
        envPreferredName: Deno.env.get('SHEET_NAME'),
        envPreferredGid: Deno.env.get('SHEET_GID'),
      });
      const key = resolved.sheetTitle;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rec);
    }

    for (const [sheetTitle, tabReceipts] of groups) {
      if (tabReceipts.length === 0) continue;
      const firstSn = tabReceipts[0].stand_number?.toString().trim().toUpperCase() || '';
      const m0 =
        parseCollectionScheduleTabMonths(sheetTitle) ??
        standToMonths.get(firstSn) ??
        DEFAULT_PAYMENT_PLAN_MONTHS;

      const sheetExists = sheets.some((s: { properties?: { title?: string } }) => s.properties?.title === sheetTitle);
      if (!sheetExists) {
        console.error(`Skipping post: tab "${sheetTitle}" not found in workbook`);
        continue;
      }

      const scheduleData = await fetchCollectionScheduleData(accessToken, sheetTitle, m0);
      const tabPosted = await postReceiptsToCollectionSchedule(accessToken, tabReceipts, scheduleData);
      posted.push(...tabPosted);
    }

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
