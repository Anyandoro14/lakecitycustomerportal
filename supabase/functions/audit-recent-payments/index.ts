import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  PAYMENT_GRID_BASE_DATE,
  PAYMENT_GRID_START_COL,
  PAYMENT_GRID_END_COL,
  listCollectionScheduleDataTabTitles,
  findStandRowInCollectionTabs,
  columnIndexToA1Letter,
} from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const parseCurrency = (val: string): number => {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// ── Google auth (same as process-approved-receipts) ──
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

  if (!serviceAccountEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(serviceAccountEmail)) {
    throw new Error('Invalid or missing service account email');
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

  const base64url = (str: string) =>
    btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

  const extractPemBase64 = (pem: string) => {
    const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
    const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
    const body = match ? match[1] : normalized;
    let b64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
    const pad = b64.length % 4;
    if (pad === 2) b64 += '==';
    else if (pad === 3) b64 += '=';
    else if (pad === 1) throw new Error('Invalid base64 length');
    return b64;
  };

  const base64Key = extractPemBase64(privateKeyPem);
  const raw = atob(base64Key);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8", buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(signatureInput));
  const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });

  if (!tokenResponse.ok) throw new Error(`Token error: ${await tokenResponse.text()}`);
  return (await tokenResponse.json()).access_token;
}

// ── Helpers ──
function monthColForDate(d: Date): number {
  const baseYear = PAYMENT_GRID_BASE_DATE.getFullYear();
  const baseMonth = PAYMENT_GRID_BASE_DATE.getMonth();
  const offset = (d.getFullYear() - baseYear) * 12 + (d.getMonth() - baseMonth);
  return PAYMENT_GRID_START_COL + offset;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

// ── Scan early columns mode: find any non-zero values in columns M,N (Jan/Feb 2022) ──
async function scanEarlyColumns(
  accessToken: string,
  spreadsheetId: string,
  sheets: any[],
  fix: boolean,
  colsToScan: number[] // 0-based column indices
): Promise<Response> {
  const collectionTabs = listCollectionScheduleDataTabTitles(sheets);

  // Fetch Receipts_Intake to cross-reference
  const intakeRange = encodeURIComponent('Receipts_Intake!A:L');
  const intakeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${intakeRange}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  interface IntakeMatch {
    intake_row: number;
    intake_id: string;
    timestamp: string;
    stand: string;
    payment_date: string;
    amount: number;
    status: string;
  }
  const intakeMatches: IntakeMatch[] = [];
  if (intakeRes.ok) {
    const intakeData = await intakeRes.json();
    const intakeRows: string[][] = intakeData.values || [];
    for (let i = 1; i < intakeRows.length; i++) {
      const r = intakeRows[i];
      intakeMatches.push({
        intake_row: i + 1,
        intake_id: (r[0] || '').trim(),
        timestamp: (r[1] || '').trim(),
        stand: (r[2] || '').trim().toUpperCase(),
        payment_date: (r[4] || '').trim(),
        amount: parseCurrency(r[5] || ''),
        status: (r[10] || '').trim(),
      });
    }
  }

  interface EarlyColEntry {
    sheet_tab: string;
    row: number;
    stand_number: string;
    customer_name: string;
    column_letter: string;
    column_index: number;
    column_date: string;
    value: string;
    raw_value: number;
    receipt_match: IntakeMatch | null;
    correct_column_letter: string | null;
    correct_column_date: string | null;
    action_needed: 'clear_and_repost' | 'flag_no_match' | 'none';
  }

  const report: EarlyColEntry[] = [];
  interface FixAction { clearCell: string; writeCell: string; value: number; existingTarget: number; rowData: string[] }
  const fixes: FixAction[] = [];

  for (const tabTitle of collectionTabs) {
    const r = encodeURIComponent(`${tabTitle}!A:GZ`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${r}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) continue;
    const d = await res.json();
    const rows: string[][] = d.values || [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const standNumber = (row[0] || '').trim(); // Column A = stand number
      if (!standNumber) continue;
      const customerName = (row[1] || '').trim(); // Column B = customer name
      const standNorm = standNumber.toUpperCase();

      for (const colIdx of colsToScan) {
        const cellVal = (row[colIdx] || '').trim();
        if (!cellVal) continue;
        const numVal = parseCurrency(cellVal);
        if (numVal <= 0) continue;

        const monthsFromBase = colIdx - PAYMENT_GRID_START_COL;
        const colDate = new Date(2022, monthsFromBase, 5);
        const colDateStr = colDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const colLetter = columnIndexToA1Letter(colIdx);

        // Cross-reference: find a Posted receipt for this stand with matching amount
        // Use the stand from Column A (which holds the stand number in Collection Schedule)
        const match = intakeMatches.find(m =>
          m.stand === standNorm && Math.abs(m.amount - numVal) < 0.01 && m.status.toLowerCase() === 'posted'
        );

        let correctColLetter: string | null = null;
        let correctColDate: string | null = null;
        let correctColIdx = -1;
        if (match) {
          const pd = parseDate(match.payment_date);
          if (pd) {
            correctColIdx = monthColForDate(pd);
            correctColLetter = columnIndexToA1Letter(correctColIdx);
            const cd = new Date(2022, correctColIdx - PAYMENT_GRID_START_COL, 5);
            correctColDate = cd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          }
        }

        const action: EarlyColEntry['action_needed'] = match ? 'clear_and_repost' : 'flag_no_match';

        report.push({
          sheet_tab: tabTitle,
          row: i + 1,
          stand_number: standNumber,
          customer_name: customerName,
          column_letter: colLetter,
          column_index: colIdx,
          column_date: colDateStr,
          value: cellVal,
          raw_value: numVal,
          receipt_match: match || null,
          correct_column_letter: correctColLetter,
          correct_column_date: correctColDate,
          action_needed: action,
        });

        if (fix && match && correctColIdx >= PAYMENT_GRID_START_COL && correctColIdx <= PAYMENT_GRID_END_COL) {
          const existingTarget = parseCurrency(row[correctColIdx] || '');
          fixes.push({
            clearCell: `${tabTitle}!${colLetter}${i + 1}`,
            writeCell: `${tabTitle}!${correctColLetter}${i + 1}`,
            value: numVal,
            existingTarget,
            rowData: row,
          });
        }
      }
    }
  }

  // Apply fixes
  const fixResults: string[] = [];
  if (fix && fixes.length > 0) {
    for (const f of fixes) {
      // Clear wrong cell
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(f.clearCell)}:clear`;
      await fetch(clearUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Write to correct cell (additive)
      const newValue = f.existingTarget + f.value;
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(f.writeCell)}?valueInputOption=USER_ENTERED`;
      await fetch(writeUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[newValue]] }),
      });
      fixResults.push(`Moved $${f.value} from ${f.clearCell} → ${f.writeCell} (new total: ${newValue})`);
      console.log(`[FIX] ${fixResults[fixResults.length - 1]}`);
    }
  }

  const matched = report.filter(r => r.action_needed === 'clear_and_repost').length;
  const flagged = report.filter(r => r.action_needed === 'flag_no_match').length;

  return new Response(JSON.stringify({
    mode: fix ? 'fix' : 'report_only',
    scan_type: 'early_columns_with_receipt_xref',
    summary: {
      tabs_scanned: collectionTabs.length,
      misplaced_values_found: report.length,
      receipt_matched: matched,
      flagged_no_match: flagged,
      fixes_applied: fix ? fixes.length : 0,
    },
    report,
    ...(fix ? { fix_results: fixResults } : {}),
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

// ── Main ──
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const fix = url.searchParams.get('fix') === 'true';
    const mode = url.searchParams.get('mode') || 'receipt_audit';

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID not configured');

    const accessToken = await getGoogleAccessToken();

    // Fetch spreadsheet metadata
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) throw new Error('Failed to fetch spreadsheet metadata');
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];

    // Mode: scan_early — scan columns M,N (or custom) for misplaced values
    if (mode === 'scan_early') {
      const colsParam = url.searchParams.get('cols') || '12,13'; // M=12, N=13
      const colsToScan = colsParam.split(',').map(c => parseInt(c.trim(), 10)).filter(n => !isNaN(n));
      return await scanEarlyColumns(accessToken, spreadsheetId, sheets, fix, colsToScan);
    }

    // Default mode: receipt_audit (original Apr 8-10 audit)
    // 1) Read Receipts_Intake
    const intakeRange = encodeURIComponent('Receipts_Intake!A:L');
    const intakeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${intakeRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!intakeRes.ok) throw new Error('Failed to read Receipts_Intake');
    const intakeData = await intakeRes.json();
    const intakeRows: string[][] = intakeData.values || [];

    // Filter: Column K = "Posted", Column B timestamp between Apr 8-10 2026
    const startWindow = new Date(2026, 3, 8); // Apr 8
    const endWindow = new Date(2026, 3, 11); // Apr 11 (exclusive)

    interface ReceiptRow {
      rowNum: number;
      intakeId: string;
      standNumber: string;
      paymentDateStr: string;
      amount: number;
    }

    const targetReceipts: ReceiptRow[] = [];

    for (let i = 1; i < intakeRows.length; i++) {
      const row = intakeRows[i];
      const status = (row[10] || '').trim();
      if (status.toLowerCase() !== 'posted') continue;

      const tsStr = (row[1] || '').trim();
      const ts = parseDate(tsStr);
      if (!ts || ts < startWindow || ts >= endWindow) continue;

      const amount = parseCurrency(row[5] || '');
      if (amount <= 0) continue;

      targetReceipts.push({
        rowNum: i + 1,
        intakeId: (row[0] || '').trim() || `ROW_${i + 1}`,
        standNumber: (row[2] || '').trim(),
        paymentDateStr: (row[4] || '').trim(),
        amount,
      });
    }

    console.log(`Found ${targetReceipts.length} posted receipts in Apr 8-10 window`);

    const collectionTabs = listCollectionScheduleDataTabTitles(sheets);

    // Pre-fetch all collection schedule data for all tabs (A:GZ)
    const tabDataCache = new Map<string, string[][]>();
    for (const tabTitle of collectionTabs) {
      const r = encodeURIComponent(`${tabTitle}!A:GZ`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${r}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const d = await res.json();
        tabDataCache.set(tabTitle, d.values || []);
      }
    }

    interface AuditEntry {
      receipt_id: string;
      stand_number: string;
      amount: number;
      payment_date: string;
      expected_column: string;
      expected_col_index: number;
      found_in_column: string;
      found_col_index: number;
      sheet_tab: string;
      row: number;
      action_needed: 'move' | 'none';
    }

    const report: AuditEntry[] = [];
    const fixes: { sheet: string; clearCell: string; writeCell: string; value: number; existingTarget: number }[] = [];

    for (const receipt of targetReceipts) {
      // Find the stand row in collection tabs
      const loc = await findStandRowInCollectionTabs(accessToken, spreadsheetId, sheets, receipt.standNumber);
      if (!loc) {
        console.log(`Stand ${receipt.standNumber} not found in any collection tab`);
        continue;
      }

      const { sheetTitle, row1Based } = loc;
      const tabRows = tabDataCache.get(sheetTitle);
      if (!tabRows) continue;
      const rowData = tabRows[row1Based - 1] || [];

      // Expected column based on payment date
      const paymentDate = parseDate(receipt.paymentDateStr);
      const expectedCol = paymentDate ? monthColForDate(paymentDate) : -1;

      if (expectedCol < PAYMENT_GRID_START_COL || expectedCol > PAYMENT_GRID_END_COL) {
        console.log(`Receipt ${receipt.intakeId}: payment date ${receipt.paymentDateStr} out of grid range`);
        continue;
      }

      const expectedLetter = columnIndexToA1Letter(expectedCol);

      // Check if value is already in the correct column
      const expectedCellVal = parseCurrency(rowData[expectedCol] || '');
      // Look for the amount in unexpected columns (scan entire grid)
      let foundCol = -1;
      let foundLetter = 'correct';

      // If the expected cell already has the amount, it's fine
      if (Math.abs(expectedCellVal - receipt.amount) < 0.01) {
        report.push({
          receipt_id: receipt.intakeId,
          stand_number: receipt.standNumber,
          amount: receipt.amount,
          payment_date: receipt.paymentDateStr,
          expected_column: expectedLetter,
          expected_col_index: expectedCol,
          found_in_column: 'correct',
          found_col_index: expectedCol,
          sheet_tab: sheetTitle,
          row: row1Based,
          action_needed: 'none',
        });
        continue;
      }

      // Scan for misplaced value – look in columns that are NOT the expected column
      for (let col = PAYMENT_GRID_START_COL; col <= PAYMENT_GRID_END_COL; col++) {
        if (col === expectedCol) continue;
        const v = parseCurrency(rowData[col] || '');
        if (Math.abs(v - receipt.amount) < 0.01) {
          foundCol = col;
          foundLetter = columnIndexToA1Letter(col);
          break;
        }
      }

      if (foundCol === -1) {
        // Amount not found anywhere – may have been aggregated or already fixed
        report.push({
          receipt_id: receipt.intakeId,
          stand_number: receipt.standNumber,
          amount: receipt.amount,
          payment_date: receipt.paymentDateStr,
          expected_column: expectedLetter,
          expected_col_index: expectedCol,
          found_in_column: 'not_found',
          found_col_index: -1,
          sheet_tab: sheetTitle,
          row: row1Based,
          action_needed: 'none',
        });
        continue;
      }

      const entry: AuditEntry = {
        receipt_id: receipt.intakeId,
        stand_number: receipt.standNumber,
        amount: receipt.amount,
        payment_date: receipt.paymentDateStr,
        expected_column: expectedLetter,
        expected_col_index: expectedCol,
        found_in_column: foundLetter,
        found_col_index: foundCol,
        sheet_tab: sheetTitle,
        row: row1Based,
        action_needed: 'move',
      };
      report.push(entry);

      if (fix) {
        const existingTarget = parseCurrency(rowData[expectedCol] || '');
        fixes.push({
          sheet: sheetTitle,
          clearCell: `${sheetTitle}!${foundLetter}${row1Based}`,
          writeCell: `${sheetTitle}!${expectedLetter}${row1Based}`,
          value: receipt.amount,
          existingTarget,
        });
      }
    }

    // Apply fixes if requested
    let fixResults: string[] = [];
    if (fix && fixes.length > 0) {
      for (const f of fixes) {
        // Clear wrong cell
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(f.clearCell)}:clear`;
        await fetch(clearUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Write to correct cell (add to existing value)
        const newValue = f.existingTarget + f.value;
        const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(f.writeCell)}?valueInputOption=USER_ENTERED`;
        await fetch(writeUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[newValue]] }),
        });

        fixResults.push(`Moved $${f.value} from ${f.clearCell} to ${f.writeCell} (new total: ${newValue})`);
        console.log(`[FIX] ${fixResults[fixResults.length - 1]}`);
      }
    }

    const moveCount = report.filter(r => r.action_needed === 'move').length;
    const correctCount = report.filter(r => r.action_needed === 'none').length;

    return new Response(JSON.stringify({
      mode: fix ? 'fix' : 'report_only',
      summary: {
        total_receipts_checked: targetReceipts.length,
        entries_in_report: report.length,
        needs_move: moveCount,
        correct_or_not_found: correctCount,
        fixes_applied: fix ? fixes.length : 0,
      },
      report,
      ...(fix ? { fix_results: fixResults } : {}),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Audit error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
