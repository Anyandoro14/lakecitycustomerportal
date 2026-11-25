import type { Contact, Lead, OfferOfficialUse, OfferSubmission, OutboxEmailRecord, PaymentOutcome, Stand } from "./models";

export interface PaymentStart {
  /** Plain link opened in a new tab. No API: our app never handles the money. */
  zikimallUrl: string;
  /** The ZikiMall account number = the selected stand number (read-only). */
  accountNumber: string;
  /** Mock/dev only: feed a simulated ZikiMall/CBZ confirmation into the payment handler. */
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
  /**
   * MOCK/DEV ONLY: the mock ZikiMall/CBZ confirmation adapter emits a successful payment for the lead's
   * stand and the payment-confirmed handler processes it. No money moves. Pass a reference to replay one.
   */
  simulatePaymentConfirmed(leadId: string, reference?: string): Promise<PaymentOutcome>;
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
