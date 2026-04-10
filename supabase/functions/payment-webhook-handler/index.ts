import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, NormalizedPaymentEvent } from "../_shared/payment-orchestration.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!auth || auth !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabase = createClient(supabaseUrl, serviceKey);
    const event = (await req.json()) as NormalizedPaymentEvent;

    if (!event.tenantId || !event.providerCode || !event.providerEventId) {
      return new Response(JSON.stringify({ error: "tenantId, providerCode, providerEventId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = `${event.providerCode}:${event.providerEventId}`;
    const { error: webhookError } = await supabase
      .from("payment_webhook_events")
      .upsert({
        tenant_id: event.tenantId,
        provider_code: event.providerCode,
        provider_event_id: event.providerEventId,
        signature_verified: event.signatureVerified,
        idempotency_key: idempotencyKey,
        payload: event.metadata || {},
        processing_status: "pending",
      }, { onConflict: "tenant_id,provider_code,provider_event_id" });

    if (webhookError) {
      return new Response(JSON.stringify({ error: webhookError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let loanId: string | null = null;
    if (event.standNumber) {
      const { data: activeLoan } = await supabase.rpc("get_active_loan_by_stand", {
        p_tenant_id: event.tenantId,
        p_stand_number: event.standNumber,
      });
      loanId = (activeLoan as string | null) || null;
    }

    const txIdempotency = `tx:${idempotencyKey}`;
    const { data: tx, error: txError } = await supabase
      .from("payment_transactions_v2")
      .upsert({
        tenant_id: event.tenantId,
        loan_id: loanId,
        provider_code: event.providerCode,
        state: event.state,
        amount: event.amount,
        currency: event.currency || "USD",
        provider_event_id: event.providerEventId,
        provider_reference: event.providerReference || event.providerEventId,
        idempotency_key: txIdempotency,
        metadata: event.metadata || {},
        occurred_at: event.occurredAt || new Date().toISOString(),
      }, { onConflict: "tenant_id,idempotency_key" })
      .select("id")
      .single();

    if (txError) {
      await supabase
        .from("payment_webhook_events")
        .update({ processing_status: "failed", processing_error: txError.message, processed_at: new Date().toISOString() })
        .eq("tenant_id", event.tenantId)
        .eq("provider_code", event.providerCode)
        .eq("provider_event_id", event.providerEventId);

      return new Response(JSON.stringify({ error: txError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.state === "captured" && event.standNumber) {
      const receiptIdempotency = `${event.providerCode}:${event.providerEventId}:receipt`;
      const { data: existingReceipt } = await supabase
        .from("payment_receipts")
        .select("id")
        .eq("tenant_id", event.tenantId)
        .eq("gateway", event.providerCode)
        .eq("gateway_reference", event.providerReference || event.providerEventId)
        .maybeSingle();

      let receiptId = existingReceipt?.id || null;
      if (!receiptId) {
        const { data: receiptInsert } = await supabase
          .from("payment_receipts")
          .insert({
            tenant_id: event.tenantId,
            stand_number: event.standNumber.toUpperCase(),
            amount: event.amount,
            payment_date: (event.occurredAt || new Date().toISOString()).slice(0, 10),
            gateway: event.providerCode,
            gateway_reference: event.providerReference || event.providerEventId,
            gateway_metadata: { ...(event.metadata || {}), idempotency_key: receiptIdempotency },
            qc_status: "approved",
          })
          .select("id")
          .single();

        receiptId = receiptInsert?.id || null;
      }

      if (receiptId && tx?.id) {
        await supabase
          .from("payment_transactions_v2")
          .update({ payment_receipt_id: receiptId })
          .eq("id", tx.id);
      }

      if (loanId) {
        await supabase.from("loan_events").upsert({
          tenant_id: event.tenantId,
          loan_id: loanId,
          event_type: "PAYMENT_POSTED",
          event_at: event.occurredAt || new Date().toISOString(),
          amount: event.amount,
          currency: event.currency || "USD",
          source: event.providerCode,
          idempotency_key: `loan-event:${idempotencyKey}`,
          metadata: event.metadata || {},
        }, { onConflict: "tenant_id,idempotency_key" });

        await supabase.rpc("sync_v2_loan_balance", { p_loan_id: loanId });
      }
    }

    await supabase
      .from("payment_webhook_events")
      .update({ processing_status: "processed", processed_at: new Date().toISOString() })
      .eq("tenant_id", event.tenantId)
      .eq("provider_code", event.providerCode)
      .eq("provider_event_id", event.providerEventId);

    return new Response(JSON.stringify({ ok: true, transaction_id: tx?.id || null }), {
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
