// odoo-audit-data
//
// Read-only feed for the internal /internal/odoo-audit page so staff can
// verify that Odoo writes are flowing into Supabase post-cutover. Returns:
//   - last 50 payment_receipts with an Odoo origin (gateway='odoo' OR
//     odoo_collection_payment_id IS NOT NULL)
//   - 24h reconciliation: counts of receipts in DB vs. paid lines in Odoo
//   - drift sample: lakecity.collection.payment lines paid in last 24h that
//     have no matching payment_receipts row
//
// Auth: requires the caller to be a row in internal_users with role in
// ('admin','super_admin','director','internal').

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getOdooConfig, odooSearchRead } from '../_shared/odoo-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ROLES = new Set(['admin', 'super_admin', 'director', 'internal']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.replace('Bearer ', '').trim();
    if (!bearerToken) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(bearerToken);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: internalUser } = await supabase
      .from('internal_users')
      .select('id, role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!internalUser || !ALLOWED_ROLES.has(internalUser.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - internal access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = internalUser.tenant_id;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since24hDate = since24h.slice(0, 10);

    const { data: recentSyncs } = await supabase
      .from('payment_receipts')
      .select('id, stand_number, amount, payment_date, qc_status, gateway, gateway_reference, odoo_collection_payment_id, odoo_collection_schedule_id, odoo_payment_id, odoo_sync_status, created_at')
      .eq('tenant_id', tenantId)
      .or('gateway.eq.odoo,odoo_collection_payment_id.not.is.null')
      .order('created_at', { ascending: false })
      .limit(50);

    const { count: receiptsLast24h } = await supabase
      .from('payment_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', since24h);

    const { count: pendingQc } = await supabase
      .from('payment_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('qc_status', 'pending_qc');

    let odooPaidLast24h = 0;
    let driftSample: Array<Record<string, unknown>> = [];
    let odooError: string | null = null;

    try {
      const odooConfig = await getOdooConfig(tenantId);

      const recentlyPaid = await odooSearchRead(
        'lakecity.collection.payment',
        [
          ['is_paid', '=', true],
          ['paid_date', '>=', since24hDate],
        ],
        ['id', 'stand_number', 'amount_paid', 'paid_date', 'due_date', 'schedule_id'],
        odooConfig,
        { limit: 200, order: 'paid_date desc' },
      );
      odooPaidLast24h = recentlyPaid.length;

      const odooIds = recentlyPaid.map((row: any) => Number(row.id)).filter((n: number) => Number.isFinite(n));
      let matchedIds = new Set<number>();
      if (odooIds.length > 0) {
        const { data: matches } = await supabase
          .from('payment_receipts')
          .select('odoo_collection_payment_id')
          .eq('tenant_id', tenantId)
          .in('odoo_collection_payment_id', odooIds);
        matchedIds = new Set((matches || []).map((m: any) => Number(m.odoo_collection_payment_id)));
      }

      driftSample = recentlyPaid
        .filter((row: any) => !matchedIds.has(Number(row.id)))
        .slice(0, 25)
        .map((row: any) => ({
          odoo_payment_id: row.id,
          stand_number: row.stand_number,
          amount_paid: row.amount_paid,
          paid_date: row.paid_date,
          due_date: row.due_date,
          schedule_id: Array.isArray(row.schedule_id) ? row.schedule_id[0] : row.schedule_id,
        }));
    } catch (e: any) {
      odooError = e.message || String(e);
      console.error('odoo-audit-data: Odoo lookup failed:', odooError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        as_of: new Date().toISOString(),
        recent_syncs: recentSyncs || [],
        counts: {
          receipts_created_last_24h: receiptsLast24h || 0,
          odoo_payments_paid_last_24h: odooPaidLast24h,
          variance_last_24h: (receiptsLast24h || 0) - odooPaidLast24h,
          pending_qc: pendingQc || 0,
        },
        drift_sample: driftSample,
        odoo_error: odooError,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('odoo-audit-data error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
