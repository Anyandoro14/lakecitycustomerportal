import type { PaymentResultKind } from "@shared/domain/iveri.ts";
import type { Contact, Lead, OfferOfficialUse, OfferSubmission, OutboxEmailRecord, Stand } from "./models";

/** Card payment start. The amount is fixed server-side (USD 2,250); the browser never sets it. */
export type PaymentStart =
  /** iVeri Lite Full Redirect: the browser POSTs these signed fields to iVeri's hosted card page. */
  | { kind: "iveri"; reference: string; amountCents: number; action: string; fields: Record<string, string>; simulationAllowed: boolean }
  /** Local demo: the mock iVeri page stands in for the hosted card page. */
  | { kind: "mock"; reference: string; amountCents: number };

/** What the buyer sees after returning from the card page (from AuthoriseInfo, never from the browser). */
export interface PaymentResultView {
  reference: string;
  result: PaymentResultKind;
  cardStatus: number | null;
  title: string;
  message: string;
}

/**
 * A payment that needs staff attention. Never card data.
 * unmatched / rejected: approved by the bank but not applied (recorded in payment_events).
 * needs_check: approved, but AuthoriseInfo's trace or currency didn't match the attempt.
 * unconfirmed: not approved after 30 minutes (no result, declined, cancelled or try-later); a late approval
 * on that reference is still applied on the next check, so check it in iVeri BackOffice.
 */
export interface PaymentIssue {
  reference: string;
  standNumber: string;
  leadId: string | null;
  outcome: "unmatched" | "rejected" | "needs_check" | "unconfirmed";
  reason: string | null;
  createdAt: string;
}

export interface StaffSession {
  email: string;
  isStaff: boolean;
}

export interface Backend {
  mode: "mock" | "supabase";

  listStands(): Promise<Stand[]>;
  /** Side pane on the stand page: creates the lead and holds the contact details. */
  startApplication(input: { standNumber: string; contact: Contact }): Promise<{ leadId: string }>;
  getLead(leadId: string): Promise<Lead | null>;
  submitOffer(leadId: string, offer: OfferSubmission): Promise<void>;
  startPayment(leadId: string): Promise<PaymentStart>;
  /** Result for one attempt, verified server-side via iVeri AuthoriseInfo. Safe to call repeatedly. */
  paymentResult(leadId: string, reference: string, kind?: string): Promise<PaymentResultView>;
  /** Re-checks the latest attempt (for buyers whose browser never came back from the card page). */
  checkPayment(leadId: string): Promise<PaymentResultView>;
  /**
   * DEV ONLY (mock mode, or ALLOW_DEV_SIMULATIONS on the server): stand in for the card page and
   * AuthoriseInfo with the given card status (null = cancelled). Only for the caller's own attempt.
   */
  simulateCardResult?(leadId: string, reference: string, cardStatus: number | null): Promise<PaymentResultView>;
  /** Portal account step: stand number + phone must match; pre-populates records via MOCK adapters. */
  enrolPortal(leadId: string, input: { standNumber: string; phone: string }): Promise<void>;

  // Staff
  staffSession(): Promise<StaffSession | null>;
  staffSignIn(email: string, password: string): Promise<void>;
  staffSignOut(): Promise<void>;
  listLeads(): Promise<Lead[]>;
  setOfficialUse(leadId: string, value: Omit<OfferOfficialUse, "updatedBy" | "updatedAt">): Promise<void>;
  listOutbox(): Promise<OutboxEmailRecord[]>;
  listPaymentIssues(): Promise<PaymentIssue[]>;
  resetDemo?(): Promise<void>;
}
