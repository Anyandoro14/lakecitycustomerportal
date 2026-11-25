import { paymentDueNowCents } from "../domain/campaign.ts";
import { buildEmailProps, emailSubject, EMAIL_ATTACHMENTS } from "../domain/emails.ts";
import { matchLead, type PaymentConfirmation, type PaymentOutcome } from "../domain/payment-events.ts";
import { rowToLead } from "../domain/rows.ts";
import type { Lead } from "../domain/types.ts";
import { HttpError, adminClient, env } from "./http.ts";
import { loadStand } from "./leads.ts";

/**
 * Payment-confirmed event handler (server side of payment-events.ts). Fed by the ZikiMall/CBZ
 * confirmation adapter; only a MOCK exists until the confirmation source is known (OI-TBC-30).
 *
 * The lead is matched by stand number in TS, then ONE database transaction (apply_payment_confirmed)
 * records the reference, takes the stand out of available inventory, marks the lead paid and queues the
 * thank-you email in the preview outbox. A reference already processed is a no-op.
 */
export async function handlePaymentConfirmed(event: PaymentConfirmation): Promise<PaymentOutcome> {
  const db = adminClient();
  const reference = event.reference.trim();
  if (!reference) return { status: "rejected", reason: "Missing payment reference." };
  if (event.amountCents !== paymentDueNowCents()) {
    await recordUnapplied(reference, event, "rejected");
    return { status: "rejected", reason: "Amount does not match the USD 2,250 due." };
  }

  const { data: rows, error } = await db.from("leads").select("*").eq("stand_number", event.standNumber.trim());
  if (error) throw new HttpError(500, "Could not load applications.");
  const match = matchLead((rows ?? []).map(rowToLead), event);
  if (!("id" in match)) {
    const dup = await recordUnapplied(reference, event, "unmatched");
    return dup ? { status: "duplicate", reference } : { status: "unmatched", reason: match.reason };
  }

  const stand = await loadStand(match.standNumber);
  const paidLead: Lead = { ...match, stage: "paid", paidAt: event.paidAt, paymentReference: reference, paymentAmountCents: event.amountCents };
  const appUrl = env("APP_URL") || "http://127.0.0.1:8137";
  const portalUrl = env("PORTAL_URL") || "https://lakecity.standledger.io";

  const { data: status, error: rpcError } = await db.rpc("apply_payment_confirmed", {
    p_reference: reference,
    p_stand_number: stand.standNumber,
    p_lead_id: match.id,
    p_amount_cents: event.amountCents,
    p_paid_at: event.paidAt,
    p_source: event.source,
    p_email_to: match.contact.email,
    p_email_subject: emailSubject("payment_thank_you", stand.standNumber),
    p_email_props: buildEmailProps(paidLead, stand, { appUrl, portalUrl }),
    p_email_attachments: EMAIL_ATTACHMENTS.payment_thank_you ?? [],
  });
  if (rpcError) throw new HttpError(409, rpcError.message);
  if (status === "duplicate") return { status: "duplicate", reference };
  if (status !== "applied") return { status: "unmatched", reason: String(status) };
  console.info(`[payment] applied ${reference.slice(0, 12)} for stand ${stand.standNumber}`);
  return { status: "applied", leadId: match.id, standNumber: stand.standNumber, nextStep: "portal", emailQueued: "payment_thank_you" };
}

/** Records a reference that could not be applied. Returns true if it had been processed before. */
async function recordUnapplied(reference: string, event: PaymentConfirmation, outcome: "rejected" | "unmatched"): Promise<boolean> {
  const { error } = await adminClient().from("payment_events").insert({
    reference,
    stand_number: event.standNumber.trim(),
    amount_cents: event.amountCents,
    source: event.source,
    outcome,
  });
  return !!error && error.code === "23505";
}
