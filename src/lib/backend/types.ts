import type { Contact, Lead, OfferOfficialUse, OfferSubmission, OutboxEmailRecord, Stand } from "./models";

export interface PaymentStart {
  /** null while the ZikiMall integration is TBC (OI-TBC-07). */
  redirectUrl: string | null;
  simulationAllowed: boolean;
  /** Fixed server-side: down payment + legal fee (USD 2,250). Never taken from the browser. */
  amountCents: number;
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
  /** DEV ONLY: simulates the ZikiMall "payment confirmed" callback. No money moves. */
  simulatePaymentConfirmed(leadId: string): Promise<void>;
  /** Portal account step: stand number + phone must match; pre-populates records via MOCK adapters. */
  enrolPortal(leadId: string, input: { standNumber: string; phone: string }): Promise<void>;

  // Staff
  staffSession(): Promise<StaffSession | null>;
  staffSignIn(email: string, password: string): Promise<void>;
  staffSignOut(): Promise<void>;
  listLeads(): Promise<Lead[]>;
  setOfficialUse(leadId: string, value: Omit<OfferOfficialUse, "updatedBy" | "updatedAt">): Promise<void>;
  listOutbox(): Promise<OutboxEmailRecord[]>;
  resetDemo?(): Promise<void>;
}
