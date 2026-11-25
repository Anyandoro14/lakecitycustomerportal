// Payment-confirmed event handler (Alex, 2026-11-25). Called ONLY for an iVeri AuthoriseInfo card status 0
// (see iveri.ts). In one atomic step it:
//   1. takes the stand out of available inventory (status "paid"; allocation to the buyer happens only
//      at signing, status "signed"),
//   2. queues the branded welcome/thank-you email (preview outbox until a provider is configured, OI-TBC-20),
//   3. advances the wizard to the next step (portal account).
// Idempotent: a payment reference is processed once. Keyed by stand number: the reference encodes the stand
// and the lead must hold an open offer on that stand. A payment that can't be applied (stand already sold,
// lead already paid) is still recorded as "unmatched" so staff can refund it. This mirrors the SQL function
// apply_payment_confirmed used on the server.

import { paymentDueNowCents } from "./campaign.ts";
import type { WizardStep } from "./flow.ts";
import type { ApplyPaymentInput } from "./iveri.ts";
import type { Lead, Stand } from "./types.ts";

export type PaymentOutcome =
  | { status: "applied"; leadId: string; standNumber: string; nextStep: WizardStep; emailQueued: "payment_thank_you" }
  | { status: "duplicate"; reference: string }
  | { status: "unmatched"; reason: string }
  | { status: "rejected"; reason: string };

/** Everything the handler reads and the single atomic commit it performs. */
export interface PaymentEventStore {
  isProcessed(reference: string): boolean;
  lead(leadId: string): Lead | null;
  stand(standNumber: string): Stand | null;
  /**
   * Must apply all of these together or not at all: record the reference with its outcome, update the
   * stand and the lead, and queue the email.
   */
  commit(change: { reference: string; event: ApplyPaymentInput; outcome: PaymentOutcome; stand?: Stand; lead?: Lead; emailFor?: Lead }): void;
}

export function handlePaymentConfirmed(store: PaymentEventStore, event: ApplyPaymentInput): PaymentOutcome {
  const reference = event.reference.trim();
  if (!reference) return { status: "rejected", reason: "Missing payment reference." };
  if (store.isProcessed(reference)) return { status: "duplicate", reference };

  const finish = (outcome: PaymentOutcome, extra: { stand?: Stand; lead?: Lead; emailFor?: Lead } = {}) => {
    store.commit({ reference, event, outcome, ...extra });
    return outcome;
  };

  if (event.amountCents !== paymentDueNowCents()) {
    return finish({ status: "rejected", reason: "Amount does not match the USD 2,250 due." });
  }
  const lead = store.lead(event.leadId);
  if (!lead || lead.standNumber !== event.standNumber.trim()) return finish({ status: "unmatched", reason: "Payment does not match an application for this stand." });
  if (!lead.offer || lead.stage !== "form_filled") return finish({ status: "unmatched", reason: "This application is not awaiting payment." });
  const stand = store.stand(lead.standNumber);
  if (!stand || stand.status !== "available") return finish({ status: "unmatched", reason: `Stand ${lead.standNumber} is no longer available.` });

  const paid: Lead = { ...lead, stage: "paid", paidAt: event.paidAt, paymentReference: reference, paymentAmountCents: event.amountCents };
  return finish(
    { status: "applied", leadId: paid.id, standNumber: stand.standNumber, nextStep: "portal", emailQueued: "payment_thank_you" },
    { stand: { ...stand, status: "paid", reservedLeadId: paid.id }, lead: paid, emailFor: paid },
  );
}
