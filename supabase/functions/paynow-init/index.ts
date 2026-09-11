import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import {
  buildMerchantReference,
  formatPaynowAmount,
  initiatePaynowTransaction,
  loadPaynowCredentials,
  normalizeZwMobile,
} from "../_shared/paynow.ts";
import {
  checkStandPortalEnrolled,
  normalizeStandNumber,
  resolveTenantId,
} from "../_shared/portal-enrollment.ts";

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
  const service = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method === "GET") {
      const creds = await loadPaynowCredentials(service, null);
      return json({ configured: Boolean(creds), integration_id: creds?.id ?? null });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: internalUser } = await service
      .from("internal_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (internalUser) {
      return json({ error: "Staff accounts cannot take customer payments from Looking Glass." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const standNumber = normalizeStandNumber(String(body.stand_number || ""));
    const amount = formatPaynowAmount(Number(body.amount));
    const minAmount = formatPaynowAmount(Number(body.min_amount || 0));
    const maxAmount = formatPaynowAmount(Number(body.max_amount || 0));
    const returnOrigin = String(body.return_origin || "").replace(/\/$/, "");
    const method = body.method === "ecocash" || body.method === "onemoney" ? body.method : undefined;
    const phoneRaw = String(body.phone || "");

    if (!standNumber) return json({ error: "Stand number is required" }, 400);
    if (!Number.isFinite(amount) || amount < 0.5) {
      return json({ error: "Amount must be at least $0.50" }, 400);
    }
    if (minAmount > 0 && amount + 1e-6 < minAmount) {
      return json({ error: `Amount must be at least $${minAmount.toFixed(2)} (minimum instalment)` }, 400);
    }
    if (maxAmount > 0 && amount - 1e-6 > maxAmount) {
      return json({ error: `Amount cannot exceed outstanding balance of $${maxAmount.toFixed(2)}` }, 400);
    }
    if (!returnOrigin || !/^https?:\/\//i.test(returnOrigin)) {
      return json({ error: "return_origin must be an absolute URL origin" }, 400);
    }

    const { data: profile } = await service
      .from("profiles")
      .select("stand_number, email, full_name, phone_number")
      .eq("id", user.id)
      .maybeSingle();

    const profileStand = normalizeStandNumber(profile?.stand_number || "");
    if (profileStand && profileStand !== standNumber) {
      return json({ error: "Stand number does not match this account" }, 403);
    }

    const tenantId = await resolveTenantId(service, user.app_metadata?.tenant_id || body.tenant_id);
    if (!tenantId) return json({ error: "Could not resolve tenant" }, 500);

    const enrolled = await checkStandPortalEnrolled(service, tenantId, standNumber);
    if (!enrolled.enrolled) return json({ error: enrolled.message }, 403);

    const credentials = await loadPaynowCredentials(service, tenantId);
    if (!credentials) {
      return json({
        error: "Paynow is not configured. Set PAYNOW_INTEGRATION_KEY (and optional PAYNOW_INTEGRATION_ID) as Edge Function secrets.",
        configured: false,
      }, 503);
    }

    let phone: string | undefined;
    if (method) {
      phone = normalizeZwMobile(phoneRaw) || undefined;
      if (!phone) return json({ error: "Enter a valid Zimbabwe mobile number (e.g. 0771234567)" }, 400);
    }

    const reference = buildMerchantReference(standNumber);
    const resulturl = `${supabaseUrl}/functions/v1/paynow-webhook`;
    const returnurl = `${returnOrigin}/pay/return?reference=${encodeURIComponent(reference)}`;

    const { data: tx, error: insertErr } = await service
      .from("payment_transactions")
      .insert({
        tenant_id: tenantId,
        stand_number: standNumber,
        customer_email: profile?.email || user.email || null,
        customer_name: profile?.full_name || null,
        amount_usd: amount,
        local_currency: "USD",
        gateway: "paynow",
        gateway_reference: reference,
        status: "pending",
        settlement_status: "unsettled",
        user_id: user.id,
        metadata: {
          method: method || "hosted",
          min_amount: minAmount,
          max_amount: maxAmount,
        },
      })
      .select("id")
      .single();

    if (insertErr || !tx) {
      console.error("paynow-init insert failed:", insertErr?.message);
      return json({ error: "Could not create payment session" }, 500);
    }

    const initiated = await initiatePaynowTransaction({
      credentials,
      reference,
      amount,
      additionalinfo: `Lake City stand ${standNumber} instalment`,
      returnurl,
      resulturl,
      authemail: profile?.email || user.email || undefined,
      authphone: phone || profile?.phone_number || undefined,
      authname: profile?.full_name || undefined,
      merchanttrace: reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 32),
      phone,
      method,
    });

    if (!initiated.ok) {
      await service
        .from("payment_transactions")
        .update({ status: "failed", error_message: initiated.error })
        .eq("id", tx.id);
      return json({ error: initiated.error }, 502);
    }

    await service
      .from("payment_transactions")
      .update({
        gateway_checkout_url: initiated.browserurl || null,
        metadata: {
          method: method || "hosted",
          pollurl: initiated.pollurl,
          paynow_init: initiated.raw,
        },
      })
      .eq("id", tx.id);

    return json({
      reference,
      pollurl: initiated.pollurl,
      browserurl: initiated.browserurl || null,
      express: Boolean(method),
    });
  } catch (error) {
    console.error("paynow-init error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
