import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type StandRow = {
  id: string;
  tenant_id: string;
  stand_number: string;
  land_use: string | null;
  area_sqm: number | null;
  phase: string | null;
  rights: string | null;
  status: string | null;
  purchase_price: number | null;
  agreement_requested: string | null;
  agreement_signed_warwickshire: string | null;
  agreement_signed_by_client: string | null;
};

function rowToOdooItem(row: StandRow, archive: boolean) {
  return {
    stand_number: row.stand_number,
    status: row.status,
    purchase_price: row.purchase_price,
    land_use: row.land_use,
    phase: row.phase,
    rights: row.rights,
    agreement_requested: row.agreement_requested,
    agreement_signed_warwickshire: row.agreement_signed_warwickshire,
    agreement_signed_by_client: row.agreement_signed_by_client,
    archive,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: iu, error: iuError } = await supabaseUser
      .from("internal_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (iuError || !iu) {
      return new Response(JSON.stringify({ ok: false, error: "internal_only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const odooOrigin = (Deno.env.get("ODOO_ORIGIN") ?? "").replace(/\/$/, "");
    const odooToken = Deno.env.get("LAKECITY_LOAN_API_TOKEN") ?? "";
    if (!odooOrigin || !odooToken) {
      return new Response(JSON.stringify({ ok: false, error: "odoo_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const standId = typeof body.stand_id === "string" ? body.stand_id : "";
    const standIds = Array.isArray(body.stand_ids) ? (body.stand_ids as string[]).filter(Boolean) : [];
    const archive = Boolean(body.archive);

    let stands: StandRow[] = [];

    if (standIds.length) {
      const { data, error } = await supabaseUser
        .from("stand_inventory")
        .select(
          "id, tenant_id, stand_number, land_use, area_sqm, phase, rights, status, purchase_price, agreement_requested, agreement_signed_warwickshire, agreement_signed_by_client",
        )
        .in("id", standIds);
      if (error) throw error;
      stands = (data ?? []) as StandRow[];
      if (!stands.length) {
        return new Response(JSON.stringify({ ok: false, error: "stands_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (standId) {
      const { data, error } = await supabaseUser
        .from("stand_inventory")
        .select(
          "id, tenant_id, stand_number, land_use, area_sqm, phase, rights, status, purchase_price, agreement_requested, agreement_signed_warwickshire, agreement_signed_by_client",
        )
        .eq("id", standId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ ok: false, error: "stand_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      stands = [data as StandRow];
    } else {
      return new Response(JSON.stringify({ ok: false, error: "stand_id_or_stand_ids_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = stands.map((s) => rowToOdooItem(s, archive));
    const odooRes = await fetch(`${odooOrigin}/lakecity/api/v1/stand/product-sync-batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${odooToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });

    const odooJson = await odooRes.json().catch(() => ({}));
    if (!odooRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "odoo_request_failed",
          odoo_status: odooRes.status,
          odoo_body: odooJson,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const results = (odooJson as { results?: Record<string, unknown>[] }).results ?? [];
    const tenantId = stands[0]?.tenant_id;
    const syncedAt = new Date().toISOString();

    for (let i = 0; i < results.length; i++) {
      const r = results[i] as {
        ok?: boolean;
        stand_number?: string;
        product_tmpl_id?: number;
        product_id?: number;
      };
      if (!r.ok || !r.stand_number) continue;
      await supabaseUser
        .from("stand_inventory")
        .update({
          odoo_product_tmpl_id: r.product_tmpl_id ?? null,
          odoo_product_id: r.product_id ?? null,
          odoo_synced_at: syncedAt,
        })
        .eq("tenant_id", tenantId)
        .eq("stand_number", r.stand_number);
    }

    return new Response(
      JSON.stringify({ ok: true, odoo: odooJson, updated_stand_ids: stands.map((s) => s.id) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
