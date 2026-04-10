import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getTenantSecret, parseMoney } from "../_shared/payment-orchestration.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const tenantId = payload?.resource?.custom_id || payload?.resource?.invoice_id?.split(":")?.[0] || payload?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id missing from PayPal payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sharedSecret = await getTenantSecret(supabaseUrl, serviceKey, tenantId, "paypal_webhook_secret", "PAYPAL_WEBHOOK_SECRET");
    const incomingSecret = req.headers.get("paypal-transmission-sig") || "";

    if (!sharedSecret || !incomingSecret || incomingSecret !== sharedSecret) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType = (payload?.event_type || "").toString().toUpperCase();
    const successful = eventType.includes("PAYMENT.CAPTURE.COMPLETED");
    const amount = parseMoney(payload?.resource?.amount?.value);
    const standNumber = payload?.resource?.custom?.stand_number || payload?.resource?.custom_id?.split(":")?.[1] || null;
    const providerEventId = payload?.id || payload?.resource?.id || crypto.randomUUID();
    const normalized = {
      tenantId,
      providerCode: "paypal",
      providerEventId,
      providerReference: payload?.resource?.invoice_id || providerEventId,
      standNumber,
      amount,
      currency: payload?.resource?.amount?.currency_code || "USD",
      state: successful ? "captured" : "failed",
      occurredAt: payload?.create_time || new Date().toISOString(),
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
