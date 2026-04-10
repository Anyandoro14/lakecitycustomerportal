import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getTenantSecret, parseMoney } from "../_shared/payment-orchestration.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const tenantId = payload?.meta_data?.tenant_id || payload?.meta?.tenant_id || payload?.data?.meta_data?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id missing from metadata" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const secret = await getTenantSecret(supabaseUrl, serviceKey, tenantId, "flutterwave_webhook_secret", "FLUTTERWAVE_WEBHOOK_SECRET");
    const signature = req.headers.get("flutterwave-signature") || req.headers.get("verif-hash") || "";

    if (!secret || !signature || signature !== secret) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const status = (payload?.status || payload?.data?.status || "").toString().toLowerCase();
    const successful = status === "successful" || status === "success";
    const amount = parseMoney(payload?.amount ?? payload?.data?.amount);
    const standNumber = payload?.meta_data?.stand_number || payload?.meta?.stand_number || payload?.data?.meta_data?.stand_number || null;
    const providerEventId = payload?.id?.toString() || payload?.data?.id?.toString() || payload?.tx_ref || crypto.randomUUID();
    const normalized = {
      tenantId,
      providerCode: "flutterwave",
      providerEventId,
      providerReference: payload?.tx_ref || payload?.flw_ref || providerEventId,
      standNumber,
      amount,
      currency: payload?.currency || payload?.data?.currency || "USD",
      state: successful ? "captured" : "failed",
      occurredAt: payload?.created_at || payload?.data?.created_at || new Date().toISOString(),
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
