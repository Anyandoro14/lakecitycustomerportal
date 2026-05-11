import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  listCollectionScheduleDataTabTitles,
  quoteSheetRange,
} from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google service account auth -> access token (robust PEM/JSON parser)
async function getAccessToken(): Promise<string> {
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
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const base64url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

  const extractPemBase64 = (pem: string) => {
    const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
    const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
    const body = match ? match[1] : normalized;
    let b = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
    const pad = b.length % 4;
    if (pad === 2) b += '==';
    else if (pad === 3) b += '=';
    else if (pad === 1) throw new Error('Invalid base64 length');
    return b;
  };

  const base64Key = extractPemBase64(privateKeyPem);
  const raw = atob(base64Key);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(signatureInput),
  );
  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${signatureInput}.${sigB64}`;

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  if (!tokRes.ok) throw new Error(`Token exchange failed: ${await tokRes.text()}`);
  const tok = await tokRes.json();
  return tok.access_token as string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID missing');

    const accessToken = await getAccessToken();

    // List sheet tabs
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) throw new Error(`Metadata fetch failed: ${await metaRes.text()}`);
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    const tabTitles = listCollectionScheduleDataTabTitles(sheets);
    console.log(`Scanning ${tabTitles.length} Collection Schedule tabs`);

    type Row = { stand: string; name: string; email: string; phone: string; tab: string };
    const out: Row[] = [];
    const seenStands = new Set<string>();

    for (const tabTitle of tabTitles) {
      const range = encodeURIComponent(quoteSheetRange(tabTitle, 'A1:L3000'));
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.warn(`Skip "${tabTitle}": ${res.status}`);
        continue;
      }
      const data = await res.json();
      const rows: string[][] = data.values || [];
      if (rows.length < 2) continue;

      // Find header row (search up to 10 rows because some tabs have blank/banner rows on top)
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = (rows[i] || []).map((c) => String(c || '').toLowerCase().trim());
        if (r.some((c) => c.includes('first')) && r.some((c) => c.includes('email'))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        console.warn(`No header row in "${tabTitle}"`);
        continue;
      }
      const headerRow = (rows[headerIdx] || []).map((c) => String(c || '').toLowerCase().trim());

      // Detect column indices dynamically per tab
      const findIdx = (preds: Array<(h: string) => boolean>, fallback = -1) => {
        for (const pred of preds) {
          const idx = headerRow.findIndex((h) => pred(h));
          if (idx !== -1) return idx;
        }
        return fallback;
      };
      const standIdx = findIdx([
        (h) => h === 'stand number' || h === 'stand' || h === 'stand no' || h === 'stand #',
        (h) => h.includes('stand'),
      ], 0);
      const firstIdx = findIdx([(h) => h === 'first' || h === 'first name', (h) => h.includes('first')], 2);
      const lastIdx = findIdx([(h) => h === 'last' || h === 'last name', (h) => h.includes('last') || h.includes('surname')], 3);
      const emailIdx = findIdx([(h) => h === 'email' || h.includes('email') || h.includes('e-mail')], 4);
      const categoryIdx = findIdx([(h) => h.includes('category')], 5);
      const phoneIdx = findIdx([
        (h) => h === 'phone' || h === 'contact' || h === 'mobile' || h === 'cell',
        (h) => h.includes('phone') || h.includes('contact') || h.includes('mobile') || h.includes('cell') || h.includes('tel'),
      ], 6);

      console.log(`Tab "${tabTitle}" headers[0..11]=${JSON.stringify(headerRow.slice(0, 12))} | indices: stand=${standIdx} first=${firstIdx} last=${lastIdx} email=${emailIdx} cat=${categoryIdx} phone=${phoneIdx}`);

      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const stand = String(r[standIdx] || '').trim();
        const first = String(r[firstIdx] || '').trim();
        const last = String(r[lastIdx] || '').trim();
        const email = String(r[emailIdx] || '').trim();
        const category = String(r[categoryIdx] || '').trim();
        const phone = String(r[phoneIdx] || '').trim();

        if (!stand) continue;
        if (category.toUpperCase() !== 'BDO') continue;
        if (!email || !email.includes('@')) continue;
        if (seenStands.has(stand)) continue;
        seenStands.add(stand);

        const name = [first, last].filter(Boolean).join(' ').trim();
        out.push({ stand, name, email, phone, tab: tabTitle });
      }
    }

    // Sort by stand number (numeric where possible)
    out.sort((a, b) => {
      const na = parseInt(a.stand, 10);
      const nb = parseInt(b.stand, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.stand.localeCompare(b.stand);
    });

    // Build CSV
    const escape = (v: string) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = ['Stand Number', 'Full Name', 'Email', 'Phone'];
    const csvLines = [header.join(',')];
    for (const r of out) {
      csvLines.push([escape(r.stand), escape(r.name), escape(r.email), escape(r.phone)].join(','));
    }
    const csv = csvLines.join('\n');

    const wantsCsv = new URL(req.url).searchParams.get('format') === 'csv';
    if (wantsCsv) {
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="bdo-customers.csv"',
        },
      });
    }

    return new Response(
      JSON.stringify({ count: out.length, rows: out, csv }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('export-bdo-customers error:', err);
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
