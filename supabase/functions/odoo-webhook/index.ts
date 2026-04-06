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
            fetch(`${supabaseUrl}/functions/v1/generate-installments`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ contract_id: contract.id }),
            }).catch((err) => console.error('generate-installments call failed:', err));
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

        // Insert payment receipt as approved (came from Odoo, already verified)
        const { error } = await supabase
          .from('payment_receipts')
          .insert({
            tenant_id: tenantId,
            stand_number: profile.stand_number || `PARTNER-${partnerId}`,
            amount: fields.amount || 0,
            payment_date: fields.date || new Date().toISOString().split('T')[0],
            gateway: 'odoo',
            gateway_reference: fields.ref || null,
            qc_status: 'approved',
            odoo_payment_id: _id,
            odoo_sync_status: 'synced',
          });

        if (error) {
          console.error('account.payment insert error:', error.message);
        } else {
          console.log(`Inserted payment receipt from Odoo payment ${_id}`);
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
