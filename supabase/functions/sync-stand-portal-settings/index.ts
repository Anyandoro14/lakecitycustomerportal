import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { normalizeStandNumber } from "../_shared/portal-enrollment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  stand_number?: string;
  portal_enrolled?: boolean;
  deposit_required?: boolean;
  deposit_split_three?: boolean;
  deposit_due_date?: string | null;
  deposit_date_1?: string | null;
  deposit_date_2?: string | null;
  deposit_date_3?: string | null;
  deposit_amount?: number;
  payment_start_date?: string | null;
  term_months?: number;
  odoo_contract_id?: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.replace("Bearer ", "").trim();
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenants } = await supabase.from("tenants").select("id, slug").eq("is_active", true);

    let tenantId: string | null = null;
    for (const tenant of tenants || []) {
      const vaultKey = `odoo_webhook_secret_${tenant.id}`;
      const { data: secret } = await supabase.rpc("vault_read_secret", { secret_name: vaultKey });
      if (secret && secret === bearerToken) {
        tenantId = tenant.id;
        break;
      }
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Payload = await req.json();
    const standNumber = normalizeStandNumber(body.stand_number || "");
    if (!standNumber) {
      return new Response(JSON.stringify({ error: "stand_number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = {
      tenant_id: tenantId,
      stand_number: standNumber,
      portal_enrolled: Boolean(body.portal_enrolled),
      deposit_required: Boolean(body.deposit_required),
      deposit_split_three: Boolean(body.deposit_split_three),
      deposit_due_date: body.deposit_due_date || null,
      deposit_date_1: body.deposit_date_1 || null,
      deposit_date_2: body.deposit_date_2 || null,
      deposit_date_3: body.deposit_date_3 || null,
      deposit_amount: body.deposit_amount ?? 0,
      payment_start_date: body.payment_start_date || null,
      term_months: body.term_months ?? null,
      odoo_contract_id: body.odoo_contract_id ?? null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("stand_portal_settings").upsert(row, {
      onConflict: "tenant_id,stand_number",
    });

    if (error) {
      console.error("stand_portal_settings upsert:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Synced portal settings for stand ${standNumber} (tenant ${tenantId})`);

    return new Response(JSON.stringify({ ok: true, stand_number: standNumber }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-stand-portal-settings error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
