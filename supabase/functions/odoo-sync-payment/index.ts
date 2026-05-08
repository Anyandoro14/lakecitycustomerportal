// odoo-sync-payment
//
// Connects a freshly-created `payment_receipts` row (typically posted by
// `kuva-webhook` in `pending_qc` state) to the matching
// `lakecity.collection.payment` line in Odoo so the internal team can QC
// it inside Odoo's UI. We do NOT mark it paid here - only the staff member
// approving the receipt in Odoo sets `amount_paid`, which then fires the
// `odoo-webhook` automation rule and flips this receipt to `approved`
// in Supabase via that branch (matched on `odoo_collection_payment_id`).
//
// Cutover note: this replaces the legacy account.payment / loan-module-API
// paths. The only Odoo write is to update the matching collection.payment
// line's `note` field so it shows up in the Lakecity CRM views with a
// Kuva-Pending-QC tag.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getOdooConfig, odooSearchRead, odooWrite } from '../_shared/odoo-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function startOfMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function endOfMonth(iso: string): string {
  const d = new Date(iso);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bearerToken = authHeader.replace('Bearer ', '').trim();
    const internalServiceCall = bearerToken === supabaseServiceKey;
    if (!internalServiceCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(bearerToken);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const body = await req.json();
    const { receipt_id } = body;
    if (!receipt_id) {
      return new Response(
        JSON.stringify({ error: 'Missing receipt_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .select('*, tenant:tenants(id, slug, crm_provider)')
      .eq('id', receipt_id)
      .single();

    if (receiptError || !receipt) {
      return new Response(
        JSON.stringify({ error: 'Receipt not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (receipt.tenant?.crm_provider !== 'odoo') {
      console.log(`Tenant ${receipt.tenant?.slug} does not use Odoo, skipping sync`);
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'Tenant does not use Odoo' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (receipt.odoo_collection_payment_id) {
      console.log(
        `Receipt ${receipt.id} already linked to lakecity.collection.payment ` +
        `${receipt.odoo_collection_payment_id}, skipping`
      );
      return new Response(
        JSON.stringify({
          status: 'already_linked',
          odoo_collection_payment_id: receipt.odoo_collection_payment_id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, odoo_schedule_id')
      .eq('tenant_id', receipt.tenant_id)
      .eq('stand_number', receipt.stand_number)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const odooConfig = await getOdooConfig(receipt.tenant_id);

    const monthStart = startOfMonth(receipt.payment_date);
    const monthEnd = endOfMonth(receipt.payment_date);

    const baseDomain: any[] = [
      ['stand_number', '=', receipt.stand_number],
      ['due_date', '>=', monthStart],
      ['due_date', '<=', monthEnd],
    ];
    if (contract?.odoo_schedule_id) {
      baseDomain.unshift(['schedule_id', '=', contract.odoo_schedule_id]);
    }

    let lines = await odooSearchRead(
      'lakecity.collection.payment',
      baseDomain,
      ['id', 'schedule_id', 'stand_number', 'due_date', 'amount_paid', 'is_paid', 'note'],
      odooConfig,
      { limit: 1, order: 'due_date asc' },
    );

    if (lines.length === 0) {
      lines = await odooSearchRead(
        'lakecity.collection.payment',
        [
          ['stand_number', '=', receipt.stand_number],
          ['is_paid', '=', false],
        ],
        ['id', 'schedule_id', 'stand_number', 'due_date'],
        odooConfig,
        { limit: 1, order: 'due_date asc' },
      );
    }

    if (lines.length === 0) {
      console.warn(
        `No matching lakecity.collection.payment line found for stand ` +
        `${receipt.stand_number}, payment_date ${receipt.payment_date}`
      );
      await supabase
        .from('payment_receipts')
        .update({ odoo_sync_status: 'no_match' })
        .eq('id', receipt.id);
      return new Response(
        JSON.stringify({
          status: 'no_match',
          reason: 'No collection.payment line in Odoo for this stand/month',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const matched = lines[0];
    const matchedScheduleId = Array.isArray(matched.schedule_id)
      ? Number(matched.schedule_id[0])
      : null;

    const noteParts: string[] = [];
    if (matched.note) noteParts.push(String(matched.note));
    noteParts.push(
      `[Kuva ${receipt.gateway_reference || receipt.id}] amount=${Number(receipt.amount).toFixed(2)} ` +
      `pending QC (receipt ${receipt.id})`
    );
    const note = noteParts.join(' | ').slice(0, 512);

    await odooWrite(
      'lakecity.collection.payment',
      [matched.id],
      { note },
      odooConfig,
    );

    await supabase
      .from('payment_receipts')
      .update({
        odoo_collection_payment_id: matched.id,
        odoo_collection_schedule_id: matchedScheduleId,
        odoo_sync_status: 'pending_qc_in_odoo',
      })
      .eq('id', receipt.id);

    console.log(
      `Linked receipt ${receipt.id} to lakecity.collection.payment ` +
      `${matched.id} (schedule ${matchedScheduleId})`
    );

    return new Response(
      JSON.stringify({
        status: 'ok',
        odoo_collection_payment_id: matched.id,
        odoo_collection_schedule_id: matchedScheduleId,
      }),
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
