// Settlement logic shared by paynow-webhook and paynow-status.
import { isFailedStatus, isPaidStatus, isTerminalStatus, pollTransaction } from "./paynow.ts";

// deno-lint-ignore no-explicit-any
type Supabase = any;

export interface SettleOutcome {
  /** Raw Paynow status string, e.g. "Paid", "BeingProcessed", "Flagged". */
  status: string;
  paid: boolean;
  settled: boolean;
  terminal: boolean;
  narration?: string | null;
  billpay_reference?: string | null;
  paynow_reference?: string | null;
  amount?: number | null;
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
  const narration = polled?.narration || polled?.reason || null;
  const billpayReference = polled?.billpayreference || polled?.billpay_reference || null;
  const paynowReference = polled?.paynowreference || polled?.paynow_reference || null;
  const polledAmount = polled?.amount ? Number(polled.amount) : null;

  const newMetadata = {
    ...metadata,
    ...(opts.payload ? { last_callback: opts.payload } : {}),
    ...(polled ? { last_poll: polled } : {}),
    paynow_status: paynowStatus,
    ...(narration ? { narration } : {}),
    ...(billpayReference ? { billpay_reference: billpayReference } : {}),
    ...(paynowReference ? { paynow_reference: paynowReference } : {}),
  };

  if (!paid) {
    const failed = isFailedStatus(paynowStatus);
    await supabase
      .from("payment_transactions")
      .update({
        // Persist the raw Paynow status so every surface can render the same label.
        status: paynowStatus || "pending",
        error_message: failed ? narration || `Paynow status: ${paynowStatus}` : null,
        metadata: newMetadata,
      })
      .eq("id", txn.id);
    return {
      status: paynowStatus || "pending",
      paid: false,
      settled: false,
      terminal: isTerminalStatus(paynowStatus),
      narration,
      billpay_reference: billpayReference,
      paynow_reference: paynowReference,
      amount: polledAmount ?? txn.amount_usd ?? null,
    };
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
      status: paynowStatus || "Paid",
      settlement_status: "settled",
      completed_at: new Date().toISOString(),
      error_message: null,
      metadata: { ...newMetadata, receipt_id: receiptId },
    })
    .eq("id", txn.id);

  return {
    status: paynowStatus,
    paid: true,
    settled: true,
    terminal: true,
    narration,
    billpay_reference: billpayReference,
    paynow_reference: paynowReference,
    amount: polledAmount ?? txn.amount_usd ?? null,
    receipt_id: receiptId,
  };
}
