import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getTenantSecret, parseMoney, verifyHmacHex } from "../_shared/payment-orchestration.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const tenantId = payload?.data?.metadata?.tenant_id || payload?.metadata?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id missing from metadata" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const secret = await getTenantSecret(supabaseUrl, serviceKey, tenantId, "paystack_webhook_secret", "PAYSTACK_WEBHOOK_SECRET");
    const signature = req.headers.get("x-paystack-signature") || "";
    const verified = !!secret && !!signature && await verifyHmacHex(rawBody, signature, secret);

    if (!verified) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSuccess = payload?.event === "charge.success";
    const amount = parseMoney(payload?.data?.amount) / 100;
    const standNumber = payload?.data?.metadata?.stand_number || null;
    const providerEventId = payload?.data?.id?.toString() || payload?.data?.reference || crypto.randomUUID();
    const normalized = {
      tenantId,
      providerCode: "paystack",
      providerEventId,
      providerReference: payload?.data?.reference || providerEventId,
      standNumber,
      amount,
      currency: payload?.data?.currency || "USD",
      state: isSuccess ? "captured" : "failed",
      occurredAt: payload?.data?.paid_at || new Date().toISOString(),
      metadata: payload,
      signatureVerified: true,
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/payment-webhook-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(normalized),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
