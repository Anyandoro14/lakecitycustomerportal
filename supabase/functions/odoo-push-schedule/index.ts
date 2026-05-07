// supabase/functions/odoo-push-schedule
//
// Pushes a Supabase `contracts` row into the Lakecity CRM module in Odoo
// (lakecity.collection.schedule). Idempotent: matches existing schedules
// by stand_number and updates them in place.
//
// Body:
//   { contract_id: "<uuid>" }            // pushes one contract
//   { stand_number: "24000",             // alternative explicit form
//     tenant_id: "<uuid>" }
//
// Auth: requires a Supabase user JWT (Authorization: Bearer ...).
//
// Field mapping (Supabase contracts → lakecity.collection.schedule):
//   stand_number        → stand_number
//   total_price         → total_price
//   payment_start_date  → start_date     (snapped to day=5 if needed)
//   monthly_installment → number_of_installments derived from term + total
//   odoo_sale_order_id  → not directly mapped, but used to find partner
//
// The customer's Odoo res.partner.id is read from `profiles.odoo_partner_id`.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getOdooConfig, odooCreate, odooSearchRead, odooWrite } from '../_shared/odoo-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Snap a YYYY-MM-DD date string to the 5th of the same month. The
// lakecity.collection.schedule has a Python constraint requiring day=5.
function snapToFifth(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    return isoDate;
  }
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-05`;
}

// Map a Supabase contract status (active / completed / cancelled) onto
// fields the schedule cares about. We keep the mapping conservative —
// status is informational; the schedule's own state is computed from
// agreement booleans.
function deriveSchedule(contract: any, partnerId: number, termMonths: string) {
  return {
    stand_number: String(contract.stand_number),
    partner_id: partnerId,
    total_price: Number(contract.total_price) || 0,
    start_date: snapToFifth(contract.payment_start_date),
    term_months: termMonths,
    number_of_installments: parseInt(termMonths, 10),
  };
}

function pickTermMonths(contract: any): string {
  // Prefer explicit `term_months` if the contract has it.
  const t = contract?.term_months ?? contract?.metadata?.term_months;
  const valid = ['12', '24', '36', '48', '60', '72', '84', '96', '120'];
  if (t && valid.includes(String(t))) return String(t);

  // Fallback: derive from total_price / monthly_installment.
  const total = Number(contract.total_price) || 0;
  const monthly = Number(contract.monthly_installment) || 0;
  if (monthly > 0 && total > 0) {
    const guess = Math.round(total / monthly);
    const closest = valid
      .map((v) => parseInt(v, 10))
      .reduce((best, n) => (Math.abs(n - guess) < Math.abs(best - guess) ? n : best), 12);
    return String(closest);
  }
  return '24';
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const { contract_id } = body;
    if (!contract_id) {
      return new Response(
        JSON.stringify({ error: 'Missing contract_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Load the contract + tenant + customer
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*, tenant:tenants(id, slug, crm_provider), customer:profiles(id, email, full_name, phone, odoo_partner_id)')
      .eq('id', contract_id)
      .single();

    if (contractError || !contract) {
      return new Response(
        JSON.stringify({ error: 'Contract not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (contract.tenant?.crm_provider !== 'odoo') {
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'Tenant does not use Odoo' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let partnerId: number | null = contract.customer?.odoo_partner_id ?? null;
    const odooConfig = await getOdooConfig(contract.tenant_id);

    // 2. If no partner_id yet, create one in Odoo.
    if (!partnerId) {
      partnerId = await odooCreate('res.partner', {
        name: contract.customer?.full_name || `Customer ${contract.customer?.id}`,
        email: contract.customer?.email || false,
        phone: contract.customer?.phone || false,
        is_company: false,
      }, odooConfig);

      await supabase
        .from('profiles')
        .update({ odoo_partner_id: partnerId, odoo_sync_status: 'synced' })
        .eq('id', contract.customer?.id);
    }

    // 3. Find an existing schedule for this stand, in this Odoo DB.
    const existing = await odooSearchRead(
      'lakecity.collection.schedule',
      [['stand_number', '=', String(contract.stand_number)]],
      ['id', 'stand_number'],
      odooConfig,
      { limit: 1 },
    );

    const termMonths = pickTermMonths(contract);
    const values = deriveSchedule(contract, partnerId!, termMonths);

    let scheduleId: number;
    let action: 'created' | 'updated';
    if (existing.length > 0) {
      scheduleId = existing[0].id;
      await odooWrite('lakecity.collection.schedule', [scheduleId], values, odooConfig);
      action = 'updated';
    } else {
      scheduleId = await odooCreate('lakecity.collection.schedule', values, odooConfig);
      action = 'created';
    }

    // 4. Stamp the contract with the Odoo schedule id (best-effort).
    await supabase
      .from('contracts')
      .update({
        synced_at: new Date().toISOString(),
        // odoo_schedule_id is added in a small migration shipped alongside this function.
        odoo_schedule_id: scheduleId,
      })
      .eq('id', contract_id);

    console.log(`Pushed contract ${contract_id} → Odoo schedule ${scheduleId} (${action})`);

    return new Response(
      JSON.stringify({
        status: 'ok',
        action,
        odoo_schedule_id: scheduleId,
        odoo_partner_id: partnerId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('odoo-push-schedule error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
