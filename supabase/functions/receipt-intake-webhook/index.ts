import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate webhook secret from Authorization header
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.replace('Bearer ', '');

    if (!bearerToken) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up tenant by matching webhook secret
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('is_active', true);

    let tenantId: string | null = null;
    let tenantSlug: string | null = null;

    for (const tenant of tenants || []) {
      const vaultKey = `receipt_intake_secret_${tenant.id}`;
      const { data: secret } = await supabase.rpc('vault_read_secret', { secret_name: vaultKey });
      if (secret && secret === bearerToken) {
        tenantId = tenant.id;
        tenantSlug = tenant.slug;
        break;
      }
    }

    // Fallback: try matching against odoo_webhook_secret (some tenants reuse secrets)
    if (!tenantId) {
      for (const tenant of tenants || []) {
        const vaultKey = `odoo_webhook_secret_${tenant.id}`;
        const { data: secret } = await supabase.rpc('vault_read_secret', { secret_name: vaultKey });
        if (secret && secret === bearerToken) {
          tenantId = tenant.id;
          tenantSlug = tenant.slug;
          break;
        }
      }
    }

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await req.json();

    // Validate required fields
    const { stand_number, amount, payment_date, payment_method, reference, receipt_file_url } = payload;

    if (!stand_number || !amount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: stand_number, amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsedAmount = typeof amount === 'string'
      ? parseFloat(amount.replace(/[$,\s]/g, ''))
      : parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid payment amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert into payment_receipts with pending_qc status (needs QC approval)
    const { data: receipt, error: insertError } = await supabase
      .from('payment_receipts')
      .insert({
        tenant_id: tenantId,
        stand_number: stand_number.toString().trim().toUpperCase(),
        amount: parsedAmount,
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        gateway: 'google_form',
        gateway_reference: reference || null,
        gateway_metadata: { payment_method: payment_method || null, source: 'google_form_webhook' },
        receipt_file_url: receipt_file_url || null,
        qc_status: 'pending_qc',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Receipt insert error:', insertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to record receipt' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Receipt intake: tenant=${tenantSlug}, stand=${stand_number}, amount=${parsedAmount}, receipt_id=${receipt.id}`);

    return new Response(
      JSON.stringify({ status: 'ok', receipt_id: receipt.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('receipt-intake-webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
