import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read-only diagnostic scan — no auth needed for this one-time tool

    // Get Google Sheets access token
    const serviceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!;
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID')!;

    let privateKey: string;
    let serviceAccountEmail: string;
    try {
      const creds = JSON.parse(serviceAccountKey.replace(/\\n/g, '\n'));
      privateKey = creds.private_key;
      serviceAccountEmail = creds.client_email;
    } catch {
      privateKey = serviceAccountKey;
      serviceAccountEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL')!;
    }

    privateKey = privateKey.replace(/\\n/g, '\n');
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    let pemContents = privateKey;
    if (pemContents.includes(pemHeader)) {
      pemContents = pemContents.substring(
        pemContents.indexOf(pemHeader) + pemHeader.length,
        pemContents.indexOf(pemFooter)
      );
    }
    pemContents = pemContents.replace(/[^A-Za-z0-9+/=]/g, '');
    const binaryString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) binaryDer[i] = binaryString.charCodeAt(i);

    const now = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const headerB64 = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadB64 = btoa(JSON.stringify({
      iss: serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, iat: now,
    })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const key = await crypto.subtle.importKey('pkcs8', binaryDer.buffer as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${headerB64}.${payloadB64}`));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${headerB64}.${payloadB64}.${sigB64}`,
    });
    const { access_token } = await tokenRes.json();

    // Fetch sheet metadata to find first sheet
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const meta = await metaRes.json();
    const sheetTitle = meta.sheets?.[0]?.properties?.title || 'Sheet1';

    // Fetch columns A-M (stand, names, deposit=H, payment=K, first month=M)
    const range = encodeURIComponent(`${sheetTitle}!A:N`);
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const data = await dataRes.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      return new Response(JSON.stringify({ affected: [], count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const headers = rows[0];
    const standIdx = headers.findIndex((h: string) => h?.toLowerCase().includes('stand'));
    const firstNameIdx = headers.findIndex((h: string) => h?.toLowerCase().includes('first'));
    const lastNameIdx = headers.findIndex((h: string) => h?.toLowerCase().includes('last'));
    const depositIdx = headers.findIndex((h: string) => h?.toLowerCase().includes('deposit')); // Col H
    const paymentIdx = headers.findIndex((h: string) => h?.toLowerCase().includes('payment') && !h?.toLowerCase().includes('installment')); // Col K
    const firstMonthCol = 12; // Column M (0-indexed)

    const parse = (v: string) => {
      if (!v) return 0;
      const n = parseFloat(v.toString().replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    const affected: any[] = [];
    const standard: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const stand = row[standIdx]?.toString().trim() || '';
      if (!stand) continue;

      const deposit = parse(row[depositIdx] || '');
      const monthly = parse(row[paymentIdx] || '');
      const firstMonth = parse(row[firstMonthCol] || '');
      const name = `${row[firstNameIdx] || ''} ${row[lastNameIdx] || ''}`.trim();

      if (deposit <= 0 || monthly <= 0) continue;

      const expectedCombined = deposit + monthly;
      const isCombined = firstMonth > 0 && Math.abs(firstMonth - expectedCombined) < 1;

      const entry = {
        standNumber: stand,
        customerName: name,
        deposit: deposit,
        monthlyInstallment: monthly,
        firstMonthValue: firstMonth,
        expectedCombined: expectedCombined,
        difference: Math.round((firstMonth - expectedCombined) * 100) / 100,
      };

      if (isCombined) {
        affected.push(entry);
      } else {
        standard.push(entry);
      }
    }

    return new Response(JSON.stringify({
      affected,
      affectedCount: affected.length,
      standard: standard.slice(0, 30), // Include standard accounts for debugging
      standardCount: standard.length,
      summary: `Found ${affected.length} accounts where Column M ≈ Deposit + Installment (combined deposit pattern)`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
