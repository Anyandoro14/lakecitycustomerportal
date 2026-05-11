import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  listCollectionScheduleDataTabTitles,
  quoteSheetRange,
} from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---- Google Sheets auth (same robust parser pattern as export-bdo-customers) ----
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
  if (!serviceAccountEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(serviceAccountEmail)) {
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
    'pkcs8', buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', privateKey,
    new TextEncoder().encode(signatureInput),
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

// ---- Phone normalization (Zimbabwe focus) ----
function normalizePhone(raw: string): string {
  if (!raw) return '';
  let p = String(raw).replace(/[\s\-()]/g, '').trim();
  if (!p) return '';
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('263')) return '+' + p;
  if (p.startsWith('0')) return '+263' + p.slice(1);
  if (/^7\d{8}$/.test(p)) return '+263' + p;
  return p.startsWith('+') ? p : '+' + p;
}

function generateBypassCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header required');

    // Verify caller is internal staff
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error('Unauthorized');

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: internalUser } = await admin
      .from('internal_users')
      .select('id, email, role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!internalUser) throw new Error('Unauthorized: internal staff only');

    // ---- Scan Google Sheet for BDO customers (same logic as export-bdo-customers) ----
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID missing');
    const accessToken = await getAccessToken();

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) throw new Error(`Metadata fetch failed: ${await metaRes.text()}`);
    const meta = await metaRes.json();
    const tabTitles = listCollectionScheduleDataTabTitles(meta.sheets || []);

    type Row = { stand: string; name: string; email: string; phone: string };
    const out: Row[] = [];
    const seenStands = new Set<string>();

    for (const tabTitle of tabTitles) {
      const range = encodeURIComponent(quoteSheetRange(tabTitle, 'A1:L3000'));
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) continue;
      const data = await res.json();
      const rows: string[][] = data.values || [];
      if (rows.length < 2) continue;

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = (rows[i] || []).map((c) => String(c || '').toLowerCase().trim());
        if (r.some((c) => c.includes('first')) && r.some((c) => c.includes('email'))) {
          headerIdx = i; break;
        }
      }
      if (headerIdx === -1) continue;
      const headerRow = (rows[headerIdx] || []).map((c) => String(c || '').toLowerCase().trim());
      const findIdx = (preds: Array<(h: string) => boolean>, fb = -1) => {
        for (const p of preds) {
          const i = headerRow.findIndex(p);
          if (i !== -1) return i;
        }
        return fb;
      };
      const standIdx = findIdx([(h) => h === 'stand number' || h === 'stand', (h) => h.includes('stand')], 0);
      const firstIdx = findIdx([(h) => h === 'first' || h === 'first name', (h) => h.includes('first')], 2);
      const lastIdx = findIdx([(h) => h === 'last' || h === 'last name', (h) => h.includes('last') || h.includes('surname')], 3);
      const emailIdx = findIdx([(h) => h === 'email' || h.includes('email')], 4);
      const categoryIdx = findIdx([(h) => h.includes('category')], 5);
      const phoneIdx = findIdx([(h) => h === 'phone' || h === 'mobile' || h.includes('phone') || h.includes('mobile') || h.includes('cell')], 6);

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
        out.push({ stand, name: [first, last].filter(Boolean).join(' ').trim(), email, phone });
      }
    }

    out.sort((a, b) => {
      const na = parseInt(a.stand, 10), nb = parseInt(b.stand, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.stand.localeCompare(b.stand);
    });

    console.log(`Found ${out.length} BDO customers. Generating bypass codes...`);

    // ---- Generate one permanent reusable bypass code per BDO customer ----
    const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + TEN_YEARS_MS).toISOString();

    type Result = Row & { phone_normalized: string; bypass_code: string; status: string };
    const results: Result[] = [];

    for (const row of out) {
      const phoneNormalized = normalizePhone(row.phone);
      if (!phoneNormalized || phoneNormalized.length < 8) {
        results.push({ ...row, phone_normalized: '', bypass_code: '', status: 'skipped: invalid phone' });
        continue;
      }
      const code = generateBypassCode();

      // Remove any existing unused bypass codes for this phone
      await admin
        .from('twofa_bypass_codes')
        .delete()
        .eq('phone_number', phoneNormalized)
        .is('used_at', null);

      const { error: insertErr } = await admin
        .from('twofa_bypass_codes')
        .insert({
          phone_number: phoneNormalized,
          stand_number: row.stand,
          bypass_code: code,
          created_by: user.id,
          created_by_email: internalUser.email,
          customer_name: row.name || null,
          expires_at: expiresAt,
          is_reusable: true,
        });

      if (insertErr) {
        console.error(`Failed for stand ${row.stand}:`, insertErr.message);
        results.push({ ...row, phone_normalized: phoneNormalized, bypass_code: '', status: `error: ${insertErr.message}` });
      } else {
        results.push({ ...row, phone_normalized: phoneNormalized, bypass_code: code, status: 'ok' });
      }
    }

    // Audit log
    await admin.from('audit_log').insert({
      action: 'bdo_bulk_onboarding_codes_generated',
      entity_type: 'twofa_bypass_bulk',
      entity_id: 'BDO',
      performed_by: user.id,
      performed_by_email: internalUser.email,
      details: {
        total_scanned: out.length,
        successful: results.filter(r => r.status === 'ok').length,
        skipped: results.filter(r => r.status.startsWith('skipped')).length,
        errored: results.filter(r => r.status.startsWith('error')).length,
      },
    });

    // Build CSV (AWeber-friendly: Stand, Full Name, Email, Phone, Bypass Code)
    const escape = (v: string) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Stand Number', 'Full Name', 'Email', 'Phone', 'Bypass Code', 'Status'];
    const csvLines = [header.join(',')];
    for (const r of results) {
      csvLines.push([
        escape(r.stand), escape(r.name), escape(r.email),
        escape(r.phone_normalized || r.phone), escape(r.bypass_code), escape(r.status),
      ].join(','));
    }
    const csv = csvLines.join('\n');

    const wantsCsv = new URL(req.url).searchParams.get('format') === 'csv';
    if (wantsCsv) {
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="bdo-onboarding.csv"',
        },
      });
    }

    return new Response(
      JSON.stringify({
        total: results.length,
        successful: results.filter(r => r.status === 'ok').length,
        skipped: results.filter(r => r.status.startsWith('skipped')).length,
        errored: results.filter(r => r.status.startsWith('error')).length,
        rows: results,
        csv,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('bdo-bulk-onboarding error:', err);
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
