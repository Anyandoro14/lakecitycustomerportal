import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify HMAC-SHA256 signature
async function verifyHmacSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computedHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedHex === signature.toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    const kuvaSignature = req.headers.get('x-kuva-signature') || '';

    if (!kuvaSignature) {
      return new Response(
        JSON.stringify({ error: 'Missing X-Kuva-Signature header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.parse(rawBody);

    // Determine tenant from payload or header
    const tenantId = payload.tenant_id || payload.metadata?.tenant_id;
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Missing tenant_id in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify signature against tenant's Kuva webhook secret
    const vaultKey = `kuva_webhook_secret_${tenantId}`;
    const { data: secret } = await supabase.rpc('vault_read_secret', { secret_name: vaultKey });

    if (!secret) {
      return new Response(
        JSON.stringify({ error: 'Webhook secret not configured for tenant' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isValid = await verifyHmacSignature(rawBody, kuvaSignature, secret);
    if (!isValid) {
      console.error('Invalid Kuva webhook signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only process successful payments
    if (payload.status !== 'SUCCESS') {
      console.log(`Kuva webhook: status=${payload.status}, skipping`);
      return new Response(
        JSON.stringify({ status: 'ok', message: 'Non-success status ignored' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Kuva payment SUCCESS for tenant ${tenantId}: ${payload.reference}`);

    // Insert payment receipt as approved (Kuva payments are pre-verified)
    const { data: receipt, error: insertError } = await supabase
      .from('payment_receipts')
      .insert({
        tenant_id: tenantId,
        stand_number: payload.stand_number || payload.metadata?.stand_number || '',
        amount: payload.amount,
        payment_date: payload.payment_date || new Date().toISOString().split('T')[0],
        gateway: 'kuva',
        gateway_reference: payload.reference || payload.transaction_id,
        gateway_metadata: payload,
        qc_status: 'approved',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Kuva receipt insert error:', insertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to record payment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const standNumber = (payload.stand_number || payload.metadata?.stand_number)?.toString().trim().toUpperCase();
    if (standNumber) {
      const { data: contract } = await supabase
        .from('contracts')
        .select('id')
        .eq('stand_number', standNumber)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle();

      if (contract) {
        const { data: installment } = await supabase
          .from('installments')
          .select('id')
          .eq('contract_id', contract.id)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (installment) {
          await supabase
            .from('installments')
            .update({ status: 'paid', synced_at: new Date().toISOString() })
            .eq('id', installment.id);

          console.log(`Marked installment ${installment.id} as paid for stand ${standNumber}`);
        }
      }
    }

    // Broadcast via Supabase Realtime (clients subscribe to payment_receipts changes)
    // The insert above already triggers Realtime for subscribed clients

    // Trigger Odoo sync asynchronously (fire and forget)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('crm_provider')
      .eq('id', tenantId)
      .single();

    if (tenant?.crm_provider === 'odoo' && receipt?.id) {
      // Call odoo-sync-payment in the background
      fetch(`${supabaseUrl}/functions/v1/odoo-sync-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ receipt_id: receipt.id }),
      }).catch(err => console.error('Async Odoo sync failed:', err));
    }

    return new Response(
      JSON.stringify({ status: 'ok' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Kuva webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
