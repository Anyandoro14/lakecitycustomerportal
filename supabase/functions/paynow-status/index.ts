import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { loadPaynowCredentials, pollPaynowStatus } from "../_shared/paynow.ts";
import { settlePaynowTransaction } from "../_shared/paynow-settle.ts";
import { resolveTenantId } from "../_shared/portal-enrollment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    let reference = url.searchParams.get("reference") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      reference = String(body.reference || reference);
    }
    if (!reference) return json({ error: "reference is required" }, 400);

    const service = createClient(supabaseUrl, serviceKey);
    const { data: tx, error: txErr } = await service
      .from("payment_transactions")
      .select("id, stand_number, amount_usd, status, metadata, tenant_id, gateway_reference, user_id, customer_email")
      .eq("gateway", "paynow")
      .eq("gateway_reference", reference)
      .maybeSingle();

    if (txErr || !tx) return json({ error: "Payment not found" }, 404);

    const { data: profile } = await service
      .from("profiles")
      .select("stand_number")
      .eq("id", user.id)
      .maybeSingle();

    const { data: internalUser } = await service
      .from("internal_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const ownsTx = tx.user_id === user.id ||
      (profile?.stand_number && String(profile.stand_number).toUpperCase() === String(tx.stand_number).toUpperCase());
    if (!ownsTx && !internalUser) return json({ error: "Payment not found" }, 404);

    const tenantId = await resolveTenantId(service, tx.tenant_id || user.app_metadata?.tenant_id);
    const credentials = await loadPaynowCredentials(service, tenantId);
    const meta = (tx.metadata && typeof tx.metadata === "object") ? tx.metadata as Record<string, unknown> : {};
    const pollurl = typeof meta.pollurl === "string" ? meta.pollurl : "";

    let paynowStatus = typeof meta.paynow_status === "string" ? meta.paynow_status : tx.status;
    let receiptId: string | null = null;

    if (credentials && pollurl) {
      const polled = await pollPaynowStatus(pollurl, credentials.key);
      if (polled.ok && tenantId) {
        paynowStatus = polled.fields.status || paynowStatus;
        const settled = await settlePaynowTransaction(service, supabaseUrl, serviceKey, {
          tenantId,
          merchantReference: reference,
          amount: polled.fields.amount ? Number(polled.fields.amount) : Number(tx.amount_usd),
          status: polled.fields.status,
          paynowReference: polled.fields.paynowreference,
          pollurl,
          paymentchannel: polled.fields.paymentchannel,
          raw: polled.fields,
        });
        receiptId = settled.receiptId ?? null;
        return json({
          reference,
          status: settled.transactionStatus,
          paynow_status: polled.fields.status,
          amount: Number(tx.amount_usd),
          stand_number: tx.stand_number,
          receipt_id: receiptId,
          paid: settled.applied,
        });
      }
    }

    return json({
      reference,
      status: tx.status,
      paynow_status: paynowStatus,
      amount: Number(tx.amount_usd),
      stand_number: tx.stand_number,
      receipt_id: receiptId,
      paid: tx.status === "completed",
    });
  } catch (error) {
    console.error("paynow-status error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
