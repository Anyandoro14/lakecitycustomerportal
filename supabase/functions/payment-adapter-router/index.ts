import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, parseMoney } from "../_shared/payment-orchestration.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = (body.action || "create-intent").toString();
    if (action !== "create-intent") {
      return new Response(JSON.stringify({ error: "Unsupported action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = (body.tenant_id || user.app_metadata?.tenant_id || "").toString();
    const providerCode = (body.provider_code || "").toString().toLowerCase();
    const amount = parseMoney(body.amount);
    const currency = (body.currency || "USD").toString();
    const standNumber = (body.stand_number || "").toString().trim().toUpperCase();

    if (!tenantId || !providerCode || amount <= 0) {
      return new Response(JSON.stringify({ error: "tenant_id, provider_code, and positive amount are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: provider, error: providerError } = await supabase
      .from("payment_providers")
      .select("id, provider_code, is_enabled, config")
      .eq("tenant_id", tenantId)
      .eq("provider_code", providerCode)
      .maybeSingle();

    if (providerError || !provider || !provider.is_enabled) {
      return new Response(JSON.stringify({ error: "Requested payment provider is not enabled for tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: loanId } = standNumber
      ? await supabase.rpc("get_active_loan_by_stand", { p_tenant_id: tenantId, p_stand_number: standNumber })
      : { data: null };

    const idempotencyKey = crypto.randomUUID();
    const { data: intent, error: intentError } = await supabase
      .from("payment_intents")
      .insert({
        tenant_id: tenantId,
        loan_id: (loanId as string | null) || null,
        customer_id: user.id,
        provider_id: provider.id,
        amount,
        currency,
        purpose: "loan_repayment",
        status: "pending",
        external_reference: `intent:${providerCode}:${idempotencyKey}`,
        idempotency_key: idempotencyKey,
        metadata: { stand_number: standNumber || null },
      })
      .select("id, external_reference")
      .single();

    if (intentError) {
      return new Response(JSON.stringify({ error: intentError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adapterResponse = {
      provider: providerCode,
      intent_id: intent.id,
      reference: intent.external_reference,
      // The frontend can use these URLs/keys to initialize a provider SDK.
      checkout: {
        mode: "redirect",
        url: (provider.config as Record<string, unknown>)?.checkout_url || null,
        public_key: (provider.config as Record<string, unknown>)?.public_key || null,
      },
    };

    return new Response(JSON.stringify({ ok: true, ...adapterResponse }), {
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
