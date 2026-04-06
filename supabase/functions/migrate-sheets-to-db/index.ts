import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

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

// Reuse Google OAuth token generation from fetch-google-sheets pattern
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
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
    let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
    const pad = base64.length % 4;
    if (pad === 2) base64 += '==';
    else if (pad === 3) base64 += '=';
    return base64;
  };

  const base64Key = extractPemBase64(privateKeyPem);
  const raw = atob(base64Key);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8", buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKey, encoder.encode(signatureInput)
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
    throw new Error(`Failed to get access token: ${await tokenResponse.text()}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let tenantId: string | null = null;
    let dryRun = false;
    try {
      const body = await req.json();
      tenantId = body.tenant_id || null;
      dryRun = body.dry_run === true;
    } catch { /* no body */ }

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting migration for tenant ${tenantId}${dryRun ? ' (DRY RUN)' : ''}...`);

    const accessToken = await getGoogleAccessToken();
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID not configured');
    }

    // Fetch Collection Schedule data
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];

    const preferredName = Deno.env.get('SHEET_NAME');
    let sheetTitle = sheets[0]?.properties.title || 'Sheet1';
    if (preferredName) {
      const found = sheets.find((s: any) => s.properties.title === preferredName);
      if (found) sheetTitle = found.properties.title;
    }

    const range = encodeURIComponent(`${sheetTitle}!A:AZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      return new Response(
        JSON.stringify({ error: 'No data rows found in sheet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = rows[0];
    const standNumIndex = headers.findIndex((h: string) => h?.toLowerCase().includes('stand'));
    const firstNameIndex = headers.findIndex((h: string) => h?.toLowerCase().includes('first'));
    const lastNameIndex = headers.findIndex((h: string) => h?.toLowerCase().includes('last'));
    const emailIndex = headers.findIndex((h: string) => h?.toLowerCase().includes('email'));
    const totalPriceIndex = headers.findIndex((h: string) => h?.toLowerCase().includes('total price'));

    const paymentStartCol = 12; // Column M
    const paymentEndCol = 48;   // Column AW
    const totalPaidCol = 50;    // Column AY
    const currentBalanceCol = 51; // Column AZ

    // Parse first payment header for base date
    let basePaymentDate = new Date(2025, 8, 5);
    if (headers[paymentStartCol]) {
      const parsed = new Date(headers[paymentStartCol]);
      if (!isNaN(parsed.getTime())) basePaymentDate = parsed;
    }

    // Compute term_months from column range
    const termMonths = paymentEndCol - paymentStartCol + 1;

    // Fetch Receipts_Intake for itemized payments
    const receiptsSheet = sheets.find((s: any) => s.properties.title === 'Receipts_Intake');
    const receiptsMap = new Map<string, Array<{ date: string; amount: number; reference: string; method: string }>>();

    if (receiptsSheet) {
      const receiptRange = encodeURIComponent(`${receiptsSheet.properties.title}!A:L`);
      const receiptUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${receiptRange}`;
      const receiptResp = await fetch(receiptUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const receiptData = await receiptResp.json();
      const receiptRows = receiptData.values || [];

      for (let i = 1; i < receiptRows.length; i++) {
        const row = receiptRows[i];
        const stand = row[2]?.toString().trim().toUpperCase() || '';
        const status = row[10]?.toString().trim() || '';
        if (!stand || status !== 'Posted') continue;

        const amount = parseCurrency(row[5]?.toString() || '');
        if (amount <= 0) continue;

        if (!receiptsMap.has(stand)) receiptsMap.set(stand, []);
        receiptsMap.get(stand)!.push({
          date: row[4]?.toString().trim() || '',
          amount,
          reference: row[7]?.toString().trim() || '',
          method: row[6]?.toString().trim() || '',
        });
      }
    }

    const results = {
      contracts_created: 0,
      installments_created: 0,
      receipts_created: 0,
      discrepancies: [] as string[],
    };

    // Process each customer row
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const standNumber = row[standNumIndex]?.toString().trim();
      if (!standNumber) continue;

      const email = emailIndex !== -1
        ? (row[emailIndex]?.toString().trim().toLowerCase() || `stand-${standNumber}@lakecity.portal`)
        : `stand-${standNumber}@lakecity.portal`;
      const firstName = firstNameIndex !== -1 ? (row[firstNameIndex] || '') : '';
      const lastName = lastNameIndex !== -1 ? (row[lastNameIndex] || '') : '';
      const fullName = `${firstName} ${lastName}`.trim();
      const totalPrice = totalPriceIndex !== -1 ? parseCurrency(row[totalPriceIndex]) : 0;
      const sheetTotalPaid = parseCurrency(row[totalPaidCol]);
      const sheetBalance = parseCurrency(row[currentBalanceCol]);

      // Monthly installment: use column K (index 10) if available
      const monthlyInstallment = parseCurrency(row[10]?.toString() || '');
      // Deposit: column H (index 7)
      const deposit = parseCurrency(row[7]?.toString() || '');

      // Find or create profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!profile) {
        console.log(`No profile for ${email} (stand ${standNumber}), skipping contract creation`);
        continue;
      }

      if (dryRun) {
        results.contracts_created++;
        continue;
      }

      // Upsert contract
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .upsert({
          tenant_id: tenantId,
          customer_id: profile.id,
          stand_number: standNumber,
          total_price: totalPrice,
          monthly_installment: monthlyInstallment,
          payment_start_date: basePaymentDate.toISOString().split('T')[0],
          term_months: termMonths,
          deposit_amount: deposit,
          status: 'active',
        }, {
          onConflict: 'tenant_id,stand_number',
          ignoreDuplicates: false,
        })
        .select('id')
        .single();

      if (contractError) {
        console.error(`Contract upsert error for ${standNumber}:`, contractError.message);
        continue;
      }

      results.contracts_created++;

      // Generate installments
      const genResponse = await fetch(`${supabaseUrl}/functions/v1/generate-installments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ contract_id: contract.id }),
      });
      const genResult = await genResponse.json();
      results.installments_created += genResult.installments_created || 0;

      // Import receipts from Receipts_Intake
      const standKey = standNumber.toUpperCase();
      const itemizedReceipts = receiptsMap.get(standKey) || [];
      let receiptTotalFromDB = 0;

      for (const receipt of itemizedReceipts) {
        const { error: receiptError } = await supabase
          .from('payment_receipts')
          .insert({
            tenant_id: tenantId,
            stand_number: standNumber,
            amount: receipt.amount,
            payment_date: receipt.date || new Date().toISOString().split('T')[0],
            gateway: 'migration',
            gateway_reference: receipt.reference || null,
            gateway_metadata: { source: 'sheets_migration', payment_method: receipt.method },
            qc_status: 'approved',
          });

        if (!receiptError) {
          results.receipts_created++;
          receiptTotalFromDB += receipt.amount;
        }
      }

      // Mark installments as paid based on receipt count
      if (itemizedReceipts.length > 0) {
        const { data: pendingInstallments } = await supabase
          .from('installments')
          .select('id')
          .eq('contract_id', contract.id)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(itemizedReceipts.length);

        for (const inst of pendingInstallments || []) {
          await supabase
            .from('installments')
            .update({ status: 'paid', synced_at: new Date().toISOString() })
            .eq('id', inst.id);
        }
      }

      // Check for discrepancy between sheet balance and computed balance
      const computedBalance = totalPrice - receiptTotalFromDB;
      if (Math.abs(computedBalance - sheetBalance) > 1) {
        const msg = `Stand ${standNumber}: Sheet balance=$${sheetBalance}, Computed=$${computedBalance}, Diff=$${Math.abs(computedBalance - sheetBalance).toFixed(2)}`;
        results.discrepancies.push(msg);
        console.warn(msg);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Migration complete in ${duration}ms:`, results);

    return new Response(
      JSON.stringify({ status: 'ok', ...results, duration_ms: duration }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('migrate-sheets-to-db error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error', duration_ms: Date.now() - startTime }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
