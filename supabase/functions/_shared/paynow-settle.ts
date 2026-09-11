import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import {
  isFailedPaynowStatus,
  isPaidPaynowStatus,
  mapPaynowChannelToMethod,
  normalizePaynowStatus,
} from "./paynow.ts";

export type SettleInput = {
  tenantId: string;
  merchantReference: string;
  amount?: number;
  status: string;
  paynowReference?: string;
  pollurl?: string;
  paymentchannel?: string;
  raw: Record<string, unknown>;
};

export type SettleResult = {
  applied: boolean;
  already?: boolean;
  receiptId?: string | null;
  transactionStatus: string;
};

function mapTransactionStatus(paynowStatus: string): string {
  if (isPaidPaynowStatus(paynowStatus)) return "completed";
  if (isFailedPaynowStatus(paynowStatus)) return "failed";
  const s = normalizePaynowStatus(paynowStatus);
  if (s === "sent" || s === "created") return "pending";
  return s || "pending";
}

export async function settlePaynowTransaction(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  input: SettleInput,
): Promise<SettleResult> {
  const { data: tx, error: txErr } = await supabase
    .from("payment_transactions")
    .select("id, stand_number, amount_usd, status, metadata, tenant_id, gateway_reference")
    .eq("gateway", "paynow")
    .eq("gateway_reference", input.merchantReference)
    .maybeSingle();

  if (txErr || !tx) {
    throw new Error(`Unknown Paynow reference ${input.merchantReference}`);
  }

  const tenantId = tx.tenant_id || input.tenantId;
  const nextStatus = mapTransactionStatus(input.status);
  const prevMeta = (tx.metadata && typeof tx.metadata === "object") ? tx.metadata as Record<string, unknown> : {};
  const paymentMethod = mapPaynowChannelToMethod(input.paymentchannel);
  const amount = input.amount && input.amount > 0 ? input.amount : Number(tx.amount_usd);

  const metadata = {
    ...prevMeta,
    paynow_status: input.status,
    paynow_reference: input.paynowReference || prevMeta.paynow_reference,
    pollurl: input.pollurl || prevMeta.pollurl,
    payment_method: paymentMethod,
    payment_channel: input.paymentchannel || prevMeta.payment_channel,
    last_update: input.raw,
  };

  await supabase
    .from("payment_transactions")
    .update({
      status: nextStatus,
      settlement_status: isPaidPaynowStatus(input.status) ? "settled" : tx.status === "completed" ? "settled" : "unsettled",
      metadata,
      error_message: isFailedPaynowStatus(input.status) ? String(input.status) : null,
      completed_at: isPaidPaynowStatus(input.status) ? new Date().toISOString() : null,
    })
    .eq("id", tx.id);

  if (!isPaidPaynowStatus(input.status)) {
    return { applied: false, transactionStatus: nextStatus, receiptId: null };
  }

  const refs = [input.paynowReference, input.merchantReference].filter(Boolean) as string[];
  const { data: existing } = await supabase
    .from("payment_receipts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("gateway", "paynow")
    .in("gateway_reference", refs)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { applied: true, already: true, receiptId: existing.id, transactionStatus: "completed" };
  }

  const { data: receipt, error: insertError } = await supabase
    .from("payment_receipts")
    .insert({
      tenant_id: tenantId,
      stand_number: tx.stand_number,
      amount,
      payment_date: new Date().toISOString().split("T")[0],
      gateway: "paynow",
      gateway_reference: input.paynowReference || input.merchantReference,
      gateway_metadata: {
        source: "gateway",
        merchant_reference: input.merchantReference,
        paynow_reference: input.paynowReference,
        payment_method: paymentMethod,
        payment_channel: input.paymentchannel,
        paynow_status: input.status,
      },
      qc_status: "approved",
    })
    .select("id")
    .single();

  if (insertError) {
    if (String(insertError.message || "").toLowerCase().includes("duplicate")) {
      return { applied: true, already: true, receiptId: null, transactionStatus: "completed" };
    }
    throw new Error(insertError.message);
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("crm_provider")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenant?.crm_provider === "odoo" && receipt?.id) {
    fetch(`${supabaseUrl}/functions/v1/odoo-sync-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ receipt_id: receipt.id }),
    }).catch((err) => console.error("Async Odoo sync failed:", err));
  }

  return { applied: true, already: false, receiptId: receipt?.id ?? null, transactionStatus: "completed" };
}
