import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  listCollectionScheduleDataTabTitles,
  quoteSheetRange,
} from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google service account auth -> access token
async function getAccessToken(): Promise<string> {
  const rawKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY missing');

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(rawKey);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const b64url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encoder = new TextEncoder();
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput),
  );
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${signingInput}.${sigB64}`;

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
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
      const range = encodeURIComponent(quoteSheetRange(tabTitle, 'A1:G3000'));
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

      // Find header row (look for row containing "First" / "Email" or "Customer Category")
      let headerIdx = 0;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const r = (rows[i] || []).map((c) => String(c || '').toLowerCase().trim());
        if (r.some((c) => c.includes('first')) && r.some((c) => c.includes('email'))) {
          headerIdx = i;
          break;
        }
      }

      // Layout: A=Stand, B=blank?, C=First, D=Last, E=Email, F=Customer Category, G=Phone
      // Based on fetch-google-sheets: stand=0, first=2, last=3, email=4, category=5, phone=6
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const stand = String(r[0] || '').trim();
        const first = String(r[2] || '').trim();
        const last = String(r[3] || '').trim();
        const email = String(r[4] || '').trim();
        const category = String(r[5] || '').trim();
        const phone = String(r[6] || '').trim();

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
