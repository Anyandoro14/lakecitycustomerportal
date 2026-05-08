import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

async function ensureReconciliationRun(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<string | null> {
  const runDate = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('reconciliation_runs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('source', 'odoo_webhook_account_payment')
    .eq('run_date', runDate)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created } = await supabase
    .from('reconciliation_runs')
    .insert({
      tenant_id: tenantId,
      environment: 'prod',
      source: 'odoo_webhook_account_payment',
      status: 'running',
      run_date: runDate,
      summary: { created_by: 'odoo-webhook' },
    })
    .select('id')
    .single();

  return created?.id || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const { _model, _id, ...fields } = payload;

    if (!_model || !_id) {
      return new Response(
        JSON.stringify({ error: 'Missing _model or _id in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine tenant from Authorization header
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
      // Read webhook secret from Vault for this tenant
      const vaultKey = `odoo_webhook_secret_${tenant.id}`;
      const { data: secret } = await supabase.rpc('vault_read_secret', { secret_name: vaultKey });
      if (secret && secret === bearerToken) {
        tenantId = tenant.id;
        tenantSlug = tenant.slug;
        break;
      }
    }

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Odoo webhook: tenant=${tenantSlug}, model=${_model}, id=${_id}`);

    // Route by model
    switch (_model) {
      case 'res.partner': {
        const email = fields.email?.toLowerCase()?.trim();
        if (!email) {
          console.log('res.partner webhook missing email, skipping');
          break;
        }

        const { error } = await supabase
          .from('profiles')
          .upsert({
            email,
            full_name: fields.name || '',
            phone: fields.phone || null,
            odoo_partner_id: _id,
            odoo_sync_status: 'synced',
            tenant_id: tenantId,
          }, {
            onConflict: 'tenant_id,email',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error('res.partner upsert error:', error.message);
        } else {
          console.log(`Upserted profile for ${email}`);
        }
        break;
      }

      case 'sale.order': {
        const partnerId = fields.partner_id?.[0] || fields.partner_id;
        if (!partnerId) {
          console.log('sale.order webhook missing partner_id, skipping');
          break;
        }

        // Find customer by odoo_partner_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('odoo_partner_id', partnerId)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!profile) {
          console.warn(`No profile found for odoo partner_id ${partnerId}`);
          break;
        }

        // Upsert contract
        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .upsert({
            tenant_id: tenantId,
            customer_id: profile.id,
            odoo_sale_order_id: _id,
            stand_number: fields.name || `SO-${_id}`,
            total_price: fields.amount_total || 0,
            monthly_installment: 0, // Will be set via manual config or computed
            payment_start_date: fields.date_order || new Date().toISOString().split('T')[0],
            status: 'active',
            synced_at: new Date().toISOString(),
          }, {
            onConflict: 'odoo_sale_order_id',
            ignoreDuplicates: false,
          })
          .select('id')
          .single();

        if (contractError) {
          console.error('sale.order upsert error:', contractError.message);
        } else {
          console.log(`Upserted contract for SO ${_id}`);
          if (contract?.id) {
            // Keep legacy schedule generation for current portal behavior.
            fetch(`${supabaseUrl}/functions/v1/generate-installments`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ contract_id: contract.id }),
            }).catch((err) => console.error('generate-installments call failed:', err));

            // New Odoo 19 / Odoo.sh loan-module sync path.
            fetch(`${supabaseUrl}/functions/v1/odoo-loan-module-sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                action: 'upsert_contract',
                tenant_id: tenantId,
                contract_id: contract.id,
              }),
            }).catch((err) => console.error('odoo-loan-module-sync upsert_contract call failed:', err));
          }
        }
        break;
      }

      case 'account.payment': {
        const partnerId = fields.partner_id?.[0] || fields.partner_id;
        if (!partnerId) {
          console.log('account.payment webhook missing partner_id, skipping');
          break;
        }

        // Find profile to get stand number
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, stand_number')
          .eq('odoo_partner_id', partnerId)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!profile) {
          console.warn(`No profile for odoo partner_id ${partnerId}`);
          break;
        }

        const standNumber = profile.stand_number || `PARTNER-${partnerId}`;
        const paymentAmount = toNumber(fields.amount);
        const paymentDate = fields.date || new Date().toISOString().split('T')[0];
        const paymentReference = fields.ref || `ODOO-${_id}`;

        // Idempotent handling by odoo_payment_id.
        const { data: existingOdooReceipt } = await supabase
          .from('payment_receipts')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('odoo_payment_id', _id)
          .maybeSingle();

        let syncedReceiptId: string | null = existingOdooReceipt?.id || null;
        if (existingOdooReceipt?.id) {
          const { error: updErr } = await supabase
            .from('payment_receipts')
            .update({
              stand_number: standNumber,
              amount: paymentAmount,
              payment_date: paymentDate,
              gateway: 'odoo',
              gateway_reference: paymentReference,
              qc_status: 'approved',
              odoo_sync_status: 'synced',
            })
            .eq('id', existingOdooReceipt.id);
          if (updErr) {
            console.error('account.payment update error:', updErr.message);
          } else {
            console.log(`Updated existing Odoo receipt ${existingOdooReceipt.id} for payment ${_id}`);
          }
        } else {
          // Insert payment receipt as approved (came from Odoo, already verified)
          const { data: inserted, error } = await supabase
            .from('payment_receipts')
            .insert({
              tenant_id: tenantId,
              stand_number: standNumber,
              amount: paymentAmount,
              payment_date: paymentDate,
              gateway: 'odoo',
              gateway_reference: paymentReference,
              qc_status: 'approved',
              odoo_payment_id: _id,
              odoo_sync_status: 'synced',
            })
            .select('id')
            .single();

          if (error) {
            console.error('account.payment insert error:', error.message);
          } else {
            syncedReceiptId = inserted?.id || null;
            console.log(`Inserted payment receipt from Odoo payment ${_id}`);
          }
        }

        // Reconciliation check: compare against existing non-Odoo approved receipt with same reference.
        // If amounts diverge, create a reconciliation item for finance review.
        try {
          const { data: candidate } = await supabase
            .from('payment_receipts')
            .select('id, amount, gateway')
            .eq('tenant_id', tenantId)
            .eq('stand_number', standNumber)
            .eq('qc_status', 'approved')
            .eq('gateway_reference', paymentReference)
            .neq('gateway', 'odoo')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (candidate) {
            const candidateAmount = toNumber(candidate.amount);
            const variance = paymentAmount - candidateAmount;
            const absVariance = Math.abs(variance);
            if (absVariance > 0.01) {
              const runId = await ensureReconciliationRun(supabase, tenantId);
              if (runId) {
                await supabase.from('reconciliation_items').insert({
                  tenant_id: tenantId,
                  reconciliation_run_id: runId,
                  object_type: 'payment_receipt',
                  object_id: String(syncedReceiptId || _id),
                  expected_amount: paymentAmount,
                  actual_amount: candidateAmount,
                  variance_amount: variance,
                  severity: 'critical',
                  status: 'open',
                  details: {
                    source: 'odoo_webhook.account_payment',
                    odoo_payment_id: _id,
                    odoo_receipt_id: syncedReceiptId,
                    matched_receipt_id: candidate.id,
                    matched_gateway: candidate.gateway,
                    stand_number: standNumber,
                    reference: paymentReference,
                  },
                });
              }
            }
          }
        } catch (reconErr) {
          // Non-blocking: webhook must still succeed if reconciliation tables are not deployed.
          console.warn('Reconciliation check skipped:', reconErr);
        }
        break;
      }

      case 'account.move': {
        // Update installment status based on invoice payment state
        const paymentState = fields.payment_state;
        if (!paymentState) break;

        const newStatus = paymentState === 'paid' ? 'paid'
          : paymentState === 'partial' ? 'partial'
          : 'pending';

        const { error } = await supabase
          .from('installments')
          .update({ status: newStatus, synced_at: new Date().toISOString() })
          .eq('odoo_invoice_id', _id)
          .eq('tenant_id', tenantId);

        if (error) {
          console.error('account.move update error:', error.message);
        } else {
          console.log(`Updated installment status for invoice ${_id} to ${newStatus}`);
        }
        break;
      }

      case 'lakecity.collection.payment': {
        // Sync a Lakecity CRM monthly payment cell into payment_receipts so the
        // customer portal (which still reads from payment_receipts via
        // fetch-customer-data) shows the same data the staff entered in Odoo.
        //
        // Idempotent on (tenant_id, odoo_collection_payment_id).
        const standNumber: string | null =
          (typeof fields.stand_number === 'string' && fields.stand_number) ||
          (Array.isArray(fields.schedule_id) && typeof fields.schedule_id[1] === 'string'
            ? fields.schedule_id[1]
            : null);
        const amountPaid = toNumber(fields.amount_paid);
        const isPaid = Boolean(fields.is_paid) || amountPaid > 0;
        const paidDate =
          fields.paid_date ||
          fields.due_date ||
          new Date().toISOString().split('T')[0];
        const scheduleId = Array.isArray(fields.schedule_id)
          ? Number(fields.schedule_id[0])
          : Number(fields.schedule_id) || null;

        if (!standNumber) {
          console.log('lakecity.collection.payment webhook missing stand_number, skipping');
          break;
        }

        if (!isPaid) {
          // Cell hasn't been filled in yet - delete any existing approved
          // receipt we previously synced (handles the "I made a mistake,
          // unpaid" case).
          await supabase
            .from('payment_receipts')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('odoo_collection_payment_id', _id);
          console.log(`lakecity.collection.payment ${_id} unpaid; cleared synced receipt if any`);
          break;
        }

        const { data: existing } = await supabase
          .from('payment_receipts')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('odoo_collection_payment_id', _id)
          .maybeSingle();

        const receiptRow = {
          tenant_id: tenantId,
          stand_number: standNumber,
          amount: amountPaid,
          payment_date: paidDate,
          gateway: 'odoo',
          gateway_reference: `LK-${_id}`,
          qc_status: 'approved',
          odoo_collection_payment_id: _id,
          odoo_collection_schedule_id: scheduleId,
          odoo_sync_status: 'synced',
        };

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from('payment_receipts')
            .update(receiptRow)
            .eq('id', existing.id);
          if (updErr) {
            console.error('lakecity.collection.payment update error:', updErr.message);
          } else {
            console.log(`Updated receipt ${existing.id} from lakecity.collection.payment ${_id}`);
          }
        } else {
          const { error: insErr } = await supabase
            .from('payment_receipts')
            .insert(receiptRow);
          if (insErr) {
            console.error('lakecity.collection.payment insert error:', insErr.message);
          } else {
            console.log(`Inserted receipt from lakecity.collection.payment ${_id}`);
          }
        }
        break;
      }

      case 'lakecity.collection.schedule': {
        // Forward path: a brand-new collection schedule was created in Odoo
        // (rather than being pushed from Supabase via odoo-push-schedule).
        // Upsert the matching contract so the customer portal can display it.
        //
        // Idempotent on (tenant_id, stand_number).
        const standNumber: string | null =
          typeof fields.stand_number === 'string' && fields.stand_number
            ? fields.stand_number
            : null;
        const partnerId = Array.isArray(fields.partner_id)
          ? Number(fields.partner_id[0])
          : Number(fields.partner_id) || null;
        const totalPrice = toNumber(fields.sale_price ?? fields.total_price);
        const monthly = toNumber(fields.payment_amount ?? fields.monthly_installment);
        const startDate =
          fields.start_date || new Date().toISOString().split('T')[0];

        if (!standNumber) {
          console.log('lakecity.collection.schedule webhook missing stand_number, skipping');
          break;
        }

        let customerId: string | null = null;
        if (partnerId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('odoo_partner_id', partnerId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
          customerId = profile?.id ?? null;
          if (!customerId) {
            console.warn(
              `lakecity.collection.schedule ${_id}: no profile for odoo_partner_id ${partnerId}, ` +
              `creating contract without customer link.`
            );
          }
        }

        const { data: existingContract } = await supabase
          .from('contracts')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('stand_number', standNumber)
          .maybeSingle();

        const contractRow: Record<string, unknown> = {
          tenant_id: tenantId,
          stand_number: standNumber,
          total_price: totalPrice,
          monthly_installment: monthly,
          payment_start_date: startDate,
          status: 'active',
          odoo_schedule_id: _id,
          synced_at: new Date().toISOString(),
        };
        if (customerId) contractRow.customer_id = customerId;

        if (existingContract?.id) {
          const { error: updErr } = await supabase
            .from('contracts')
            .update(contractRow)
            .eq('id', existingContract.id);
          if (updErr) {
            console.error('lakecity.collection.schedule update error:', updErr.message);
          } else {
            console.log(`Updated contract ${existingContract.id} from schedule ${_id}`);
          }
        } else if (customerId) {
          const { error: insErr } = await supabase
            .from('contracts')
            .insert(contractRow);
          if (insErr) {
            console.error('lakecity.collection.schedule insert error:', insErr.message);
          } else {
            console.log(`Inserted contract from lakecity.collection.schedule ${_id}`);
          }
        } else {
          console.warn(
            `lakecity.collection.schedule ${_id}: no existing contract and no customer link; ` +
            `skipping insert. Create the customer profile first.`
          );
        }
        break;
      }

      default:
        console.log(`Unhandled Odoo model: ${_model}`);
    }

    return new Response(
      JSON.stringify({ status: 'ok' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Odoo webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
