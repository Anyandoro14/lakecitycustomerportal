import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getOdooConfig, odooCreate } from '../_shared/odoo-client.ts';

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

    // Verify caller is authenticated
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { receipt_id } = body;

    if (!receipt_id) {
      return new Response(
        JSON.stringify({ error: 'Missing receipt_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .select('*, tenant:tenants(id, slug, odoo_journal_id, crm_provider)')
      .eq('id', receipt_id)
      .single();

    if (receiptError || !receipt) {
      return new Response(
        JSON.stringify({ error: 'Receipt not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (receipt.qc_status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Receipt must be approved before syncing to Odoo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if tenant uses Odoo
    if (receipt.tenant?.crm_provider !== 'odoo') {
      console.log(`Tenant ${receipt.tenant?.slug} does not use Odoo, skipping sync`);
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'Tenant does not use Odoo' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the customer's Odoo partner ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('odoo_partner_id')
      .eq('tenant_id', receipt.tenant_id)
      .ilike('stand_number', receipt.stand_number)
      .maybeSingle();

    if (!profile?.odoo_partner_id) {
      return new Response(
        JSON.stringify({ error: 'Customer has no Odoo partner_id. Sync the customer first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Odoo config for this tenant
    const odooConfig = await getOdooConfig(receipt.tenant_id);

    // Create payment in Odoo
    const odooPaymentId = await odooCreate('account.payment', {
      partner_id: profile.odoo_partner_id,
      amount: receipt.amount,
      date: receipt.payment_date,
      ref: receipt.gateway_reference || `Portal-${receipt.id}`,
      journal_id: receipt.tenant.odoo_journal_id,
    }, odooConfig);

    // Update receipt with Odoo payment ID
    await supabase
      .from('payment_receipts')
      .update({
        odoo_payment_id: odooPaymentId,
        odoo_sync_status: 'synced',
      })
      .eq('id', receipt_id);

    console.log(`Synced receipt ${receipt_id} to Odoo payment ${odooPaymentId}`);

    return new Response(
      JSON.stringify({ status: 'ok', odoo_payment_id: odooPaymentId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Odoo sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
