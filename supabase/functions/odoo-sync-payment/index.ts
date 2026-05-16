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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { mapGatewayToOdooSource } from "../_shared/map-gateway-to-odoo-source.ts";
import { getSupabaseServiceClient, lakecityPostLoanPayment } from "../_shared/odoo-loan-http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function isAuthorizedCaller(
  supabaseUrl: string,
  serviceKey: string,
  bearer: string,
): Promise<boolean> {
  if (!bearer) return false;
  if (bearer === serviceKey) return true;

  const ac = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error } = await ac.auth.getUser(bearer);
  if (error || !user) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getSupabaseServiceClient();

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.replace("Bearer ", "").trim();

    const okCaller = await isAuthorizedCaller(supabaseUrl, serviceKey, bearer);
    if (!okCaller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { receipt_id } = body as { receipt_id?: string };

    if (!receipt_id) {
      return new Response(
        JSON.stringify({ error: "Missing receipt_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: receipt, error: receiptError } = await supabase
      .from("payment_receipts")
      .select("*, tenant:tenants(id, slug, crm_provider)")
      .eq("id", receipt_id)
      .single();

    if (receiptError || !receipt) {
      return new Response(
        JSON.stringify({ error: "Receipt not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (receipt.qc_status !== "approved") {
      return new Response(
        JSON.stringify({ error: "Receipt must be approved before syncing to Odoo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tenant = receipt.tenant as { id: string; slug?: string; crm_provider?: string } | null;
    if (tenant?.crm_provider !== "odoo") {
      console.log(`Tenant ${tenant?.slug} does not use Odoo, skipping sync`);
      return new Response(
        JSON.stringify({ status: "skipped", reason: "Tenant does not use Odoo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (String(receipt.gateway || "").toLowerCase() === "odoo") {
      console.log(`Receipt ${receipt_id} originated in Odoo; skip push-back`);
      return new Response(
        JSON.stringify({ status: "skipped", reason: "Receipt already recorded in Odoo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const meta = receipt.gateway_metadata as Record<string, unknown> | null | undefined;
    const stand = (receipt.stand_number || "").trim();
    const { data: contract } = await supabase
      .from("contracts")
      .select("id")
      .eq("tenant_id", receipt.tenant_id)
      .ilike("stand_number", stand)
      .eq("status", "active")
      .maybeSingle();

    if (!contract?.id) {
      await supabase
        .from("payment_receipts")
        .update({ odoo_sync_status: "failed" })
        .eq("id", receipt_id);

      return new Response(
        JSON.stringify({
          error: "No contract found for this stand. Create/sync the contract first.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const source = mapGatewayToOdooSource(receipt.gateway, meta);
    const ref = (receipt.gateway_reference || "").trim() || null;
    const noteParts = [`portal receipt ${receipt_id}`, receipt.gateway ? `gateway=${receipt.gateway}` : ""].filter(Boolean);
    const note = noteParts.join(" | ").slice(0, 2000);

    try {
      const result = await lakecityPostLoanPayment(
        receipt.tenant_id,
        {
          external_uid: receipt_id,
          contract_external_uid: contract.id,
          amount: Number(receipt.amount),
          payment_date: String(receipt.payment_date),
          source,
          reference: ref,
          note,
          state: "posted",
        },
        supabase,
      );

      await supabase
        .from("payment_receipts")
        .update({
          odoo_payment_id: result.payment_id,
          odoo_sync_status: "synced",
        })
        .eq("id", receipt_id);

      console.log(`Synced receipt ${receipt_id} → Odoo loan payment ${result.payment_id}`);

      return new Response(
        JSON.stringify({
          status: "ok",
          odoo_payment_id: result.payment_id,
          payment_name: result.payment_name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Odoo BNPL sync error:", msg);
      await supabase
        .from("payment_receipts")
        .update({ odoo_sync_status: "failed" })
        .eq("id", receipt_id);

      return new Response(
        JSON.stringify({ error: msg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("odoo-sync-payment:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
