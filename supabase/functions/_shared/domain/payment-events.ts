// Payment-confirmed event handler (Alex, 2026-11-25). A successful ZikiMall/CBZ payment automatically,
// in one atomic step:
//   1. takes the stand out of available inventory (status "paid"; allocation to the buyer happens only
//      at signing, status "signed"),
//   2. queues the branded thank-you email (preview outbox until a provider is configured, OI-TBC-20;
//      the trigger is wired),
//   3. advances the wizard to the next step (portal account).
// Idempotent: a payment reference is processed once. Keyed by stand number (= the ZikiMall account number).
// The confirmation source (webhook, API or bank feed) does not exist yet (OI-TBC-30), so the only adapter
// is a MOCK used to simulate confirmations in mock/dev mode. No money is handled by this app.

import { paymentDueNowCents } from "./campaign.ts";
import type { WizardStep } from "./flow.ts";
import type { Lead, Stand } from "./types.ts";

export interface PaymentConfirmation {
  /** ZikiMall/CBZ payment reference. Unique per payment. */
  reference: string;
  /** The account number the payer entered at ZikiMall: the stand number. */
  standNumber: string;
  amountCents: number;
  /** ISO timestamp of the payment. */
  paidAt: string;
  /** Surname typed at ZikiMall; used only to tell apart two open offers on the same stand. */
  payerSurname?: string;
  source: "mock";
}

/** Where confirmations come from. Only a mock exists until OI-TBC-30 is resolved. */
export interface PaymentConfirmationAdapter {
  readonly source: PaymentConfirmation["source"];
}

export const mockPaymentConfirmationAdapter = {
  source: "mock" as const,
  /** Builds the confirmation ZikiMall/CBZ would send for a successful USD 2,250 payment. */
  simulate(input: { standNumber: string; payerSurname?: string; now?: Date; reference?: string }): PaymentConfirmation {
    const now = input.now ?? new Date();
    return {
      reference: input.reference ?? `ZM-SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      standNumber: input.standNumber,
      amountCents: paymentDueNowCents(),
      paidAt: now.toISOString(),
      payerSurname: input.payerSurname,
      source: "mock",
    };
  },
} satisfies PaymentConfirmationAdapter & Record<string, unknown>;

export type PaymentOutcome =
  | { status: "applied"; leadId: string; standNumber: string; nextStep: WizardStep; emailQueued: "payment_thank_you" }
  | { status: "duplicate"; reference: string }
  | { status: "unmatched"; reason: string }
  | { status: "rejected"; reason: string };

const surnameOf = (fullName: string) => fullName.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";

/** Leads that can take this payment: offer submitted, not paid yet, same stand number. */
export function openLeadsForStand(leads: Lead[], standNumber: string): Lead[] {
  return leads.filter((l) => l.standNumber === standNumber.trim() && l.offer && l.stage === "form_filled");
}

/**
 * Picks the lead a confirmation belongs to. One open offer on the stand: that lead. Several (OI-TBC-25):
 * the one whose surname matches the payer's; otherwise nobody (left for staff to resolve).
 */
export function matchLead(leads: Lead[], event: PaymentConfirmation): Lead | { reason: string } {
  const open = openLeadsForStand(leads, event.standNumber);
  if (open.length === 1) return open[0];
  if (open.length === 0) return { reason: `No open offer for stand ${event.standNumber}.` };
  const surname = event.payerSurname?.trim().toLowerCase();
  const bySurname = surname ? open.filter((l) => surnameOf(l.offer?.buyer.fullName ?? l.contact.fullName) === surname) : [];
  if (bySurname.length === 1) return bySurname[0];
  return { reason: `${open.length} open offers for stand ${event.standNumber}; payer could not be matched.` };
}

/** Everything the handler reads and the single atomic commit it performs. */
export interface PaymentEventStore {
  isProcessed(reference: string): boolean;
  leads(): Lead[];
  stand(standNumber: string): Stand | null;
  /**
   * Must apply all of these together or not at all: record the reference, update the stand and the
   * lead, and queue the email.
   */
  commit(change: { reference: string; outcome: PaymentOutcome; stand?: Stand; lead?: Lead; emailFor?: Lead }): void;
}

export function handlePaymentConfirmed(store: PaymentEventStore, event: PaymentConfirmation): PaymentOutcome {
  const reference = event.reference.trim();
  if (!reference) return { status: "rejected", reason: "Missing payment reference." };
  if (store.isProcessed(reference)) return { status: "duplicate", reference };

  const finish = (outcome: PaymentOutcome, extra: { stand?: Stand; lead?: Lead; emailFor?: Lead } = {}) => {
    store.commit({ reference, outcome, ...extra });
    return outcome;
  };

  if (event.amountCents !== paymentDueNowCents()) {
    return finish({ status: "rejected", reason: `Amount ${event.amountCents} does not match the USD 2,250 due.` });
  }
  const stand = store.stand(event.standNumber.trim());
  if (!stand) return finish({ status: "unmatched", reason: `Unknown stand ${event.standNumber}.` });
  if (stand.status !== "available") return finish({ status: "unmatched", reason: `Stand ${stand.standNumber} is no longer available.` });

  const match = matchLead(store.leads(), event);
  if (!("id" in match)) return finish({ status: "unmatched", reason: match.reason });

  const lead: Lead = { ...match, stage: "paid", paidAt: event.paidAt, paymentReference: reference, paymentAmountCents: event.amountCents };
  const updatedStand: Stand = { ...stand, status: "paid", reservedLeadId: lead.id };
  return finish(
    { status: "applied", leadId: lead.id, standNumber: stand.standNumber, nextStep: "portal", emailQueued: "payment_thank_you" },
    { stand: updatedStand, lead, emailFor: lead },
  );
}
