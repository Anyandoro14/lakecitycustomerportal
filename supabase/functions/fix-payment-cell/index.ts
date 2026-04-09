import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  findStandRowInCollectionTabs,
  paymentColumnBounds,
  resolveCollectionScheduleSheetTitle,
  DEFAULT_PAYMENT_PLAN_MONTHS,
} from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const base64url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  const privateKey = await crypto.subtle.importKey("pkcs8", buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signatureBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signatureInput));
  const signature = base64url(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  const jwt = `${signatureInput}.${signature}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!tokenResponse.ok) throw new Error('Failed to get access token');
  const { access_token } = await tokenResponse.json();
  return access_token;
}

function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { standNumber, newValue, dryRun } = await req.json();
    if (!standNumber || newValue === undefined) {
      return new Response(JSON.stringify({ error: "standNumber and newValue required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID not configured');

    const accessToken = await getGoogleAccessToken();

    // Get metadata
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) throw new Error('Failed to fetch spreadsheet metadata');
    const metadata = await metaRes.json();
    const sheets = metadata.sheets || [];

    // Find the stand row
    const found = await findStandRowInCollectionTabs(accessToken, spreadsheetId, sheets, standNumber);
    if (!found) {
      return new Response(JSON.stringify({ error: `Stand ${standNumber} not found in any Collection Schedule tab` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { sheetTitle, row1Based } = found;
    console.log(`Found stand ${standNumber} in "${sheetTitle}" at row ${row1Based}`);

    // Read the full row to find last filled payment column
    const { start: colStart, end: colEnd } = paymentColumnBounds(DEFAULT_PAYMENT_PLAN_MONTHS);
    const startLetter = columnIndexToLetter(colStart);
    const endLetter = columnIndexToLetter(colEnd);
    const rowRange = `${sheetTitle}!${startLetter}${row1Based}:${endLetter}${row1Based}`;

    const rowRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rowRange)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!rowRes.ok) throw new Error('Failed to read row data');
    const rowData = await rowRes.json();
    const cells = rowData.values?.[0] || [];

    // Find last non-empty cell
    let lastFilledIndex = -1;
    for (let i = cells.length - 1; i >= 0; i--) {
      const v = cells[i]?.toString().trim() || '';
      if (v && v !== '0' && v !== '$0' && v !== '$0.00') {
        lastFilledIndex = i;
        break;
      }
    }

    if (lastFilledIndex === -1) {
      return new Response(JSON.stringify({ error: `No payments found for stand ${standNumber}` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const targetColIndex = colStart + lastFilledIndex;
    const targetColLetter = columnIndexToLetter(targetColIndex);
    const cellRef = `${sheetTitle}!${targetColLetter}${row1Based}`;
    const oldValue = cells[lastFilledIndex];

    console.log(`Most recent payment: ${cellRef} = "${oldValue}", updating to ${newValue}`);

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        standNumber,
        sheetTitle,
        row: row1Based,
        column: targetColLetter,
        cellRef,
        oldValue,
        newValue,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Write the new value
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRef)}?valueInputOption=USER_ENTERED`;
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[newValue]] }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to update cell: ${errText}`);
    }

    console.log(`SUCCESS: Updated ${cellRef} from "${oldValue}" to ${newValue}`);

    return new Response(JSON.stringify({
      success: true,
      standNumber,
      sheetTitle,
      row: row1Based,
      column: targetColLetter,
      cellRef,
      oldValue,
      newValue,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
