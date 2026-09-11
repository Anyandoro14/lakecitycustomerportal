// Settlement logic shared by paynow-webhook and paynow-status.
import { isPaidStatus, pollTransaction } from "./paynow.ts";

// deno-lint-ignore no-explicit-any
type Supabase = any;

export interface SettleOutcome {
  status: string;
  paid: boolean;
  settled: boolean;
  receipt_id?: string | null;
}

/**
 * Resolve the true state of a Paynow transaction and, when paid, record an
 * approved payment receipt exactly once.
 */
export async function settlePaynowTransaction(
  supabase: Supabase,
  reference: string,
  opts: { pollUrl?: string; paynowStatus?: string; payload?: Record<string, unknown> } = {},
): Promise<SettleOutcome> {
  const { data: txn, error: txnError } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("gateway", "paynow")
    .eq("gateway_reference", reference)
    .maybeSingle();

  if (txnError) throw new Error(`Transaction lookup failed: ${txnError.message}`);
  if (!txn) throw new Error(`Unknown Paynow reference: ${reference}`);

  const metadata = (txn.metadata || {}) as Record<string, unknown>;
  const pollUrl = opts.pollUrl || (metadata.poll_url as string | undefined);

  // Always trust a fresh poll over the posted status when we have a poll URL.
  let paynowStatus = opts.paynowStatus || "";
  let polled: Record<string, string> | null = null;
  if (pollUrl) {
    try {
      polled = await pollTransaction(pollUrl);
      paynowStatus = polled.status || paynowStatus;
    } catch (e) {
      console.error("Paynow poll failed:", e instanceof Error ? e.message : e);
    }
  }

  const paid = isPaidStatus(paynowStatus);
  const normalized = (paynowStatus || "unknown").toLowerCase();

  const newMetadata = {
    ...metadata,
    ...(opts.payload ? { last_callback: opts.payload } : {}),
    ...(polled ? { last_poll: polled } : {}),
    paynow_status: paynowStatus,
  };

  if (!paid) {
    const failed = ["cancelled", "failed", "disputed", "refunded"].includes(normalized);
    await supabase
      .from("payment_transactions")
      .update({
        status: failed ? "failed" : "pending",
        error_message: failed ? `Paynow status: ${paynowStatus}` : null,
        metadata: newMetadata,
      })
      .eq("id", txn.id);
    return { status: paynowStatus || "pending", paid: false, settled: false };
  }

  // Idempotency: never double-post a receipt for the same reference.
  const { data: existing } = await supabase
    .from("payment_receipts")
    .select("id")
    .eq("gateway", "paynow")
    .eq("gateway_reference", reference)
    .maybeSingle();

  let receiptId: string | null = existing?.id ?? null;

  if (!existing) {
    const amount = Number(polled?.amount ?? txn.amount_usd ?? 0);
    const { data: receipt, error: receiptError } = await supabase
      .from("payment_receipts")
      .insert({
        tenant_id: txn.tenant_id,
        stand_number: txn.stand_number,
        amount,
        payment_date: new Date().toISOString().split("T")[0],
        gateway: "paynow",
        gateway_reference: reference,
        gateway_metadata: newMetadata,
        qc_status: "approved",
      })
      .select("id")
      .single();

    if (receiptError) throw new Error(`Receipt insert failed: ${receiptError.message}`);
    receiptId = receipt?.id ?? null;
  }

  await supabase
    .from("payment_transactions")
    .update({
      status: "completed",
      settlement_status: "settled",
      completed_at: new Date().toISOString(),
      error_message: null,
      metadata: { ...newMetadata, receipt_id: receiptId },
    })
    .eq("id", txn.id);

  return { status: paynowStatus, paid: true, settled: true, receipt_id: receiptId };
}
