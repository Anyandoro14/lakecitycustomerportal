import type { IdType } from "@shared/domain/id-validation.ts";
import type {
  IdReviewLogEntry,
  Lead,
  OfferForm,
  OfferOfficialUse,
  OutboxEmailRecord,
  Stand,
} from "./models";

export interface PersonSubmission {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  idType: IdType;
  idIssuingCountry: string;
  idNumber: string;
  idExpiry: string | null;
  idFront: Blob;
  idBack: Blob | null;
}

export interface IntakeSubmission {
  buyer: PersonSubmission & { physicalAddress: string; postalAddress: string; country: string };
  coOwners: PersonSubmission[];
  standNumber: string;
}

export type SigningSession =
  | { status: "not_configured"; message: string; simulationAllowed: boolean }
  | { status: "ready"; url: string; signerName: string; signerIndex: number; totalSigners: number; integrationKey: string }
  | { status: "waiting_for_completion" }
  | { status: "signed" };

export interface PaymentStart {
  /** null while ZIKIMALL_URL is TBC. */
  redirectUrl: string | null;
  simulationAllowed: boolean;
  amountCents: number;
}

export interface StaffSession {
  email: string;
  isStaff: boolean;
}

export interface Backend {
  mode: "mock" | "supabase";

  listStands(): Promise<Stand[]>;
  submitIntake(input: IntakeSubmission): Promise<{ leadId: string }>;
  getLead(leadId: string): Promise<Lead | null>;
  submitOffer(leadId: string, offer: Omit<OfferForm, "submittedAt">): Promise<void>;
  acceptSchedule(leadId: string): Promise<void>;
  startPayment(leadId: string): Promise<PaymentStart>;
  /** DEV ONLY: simulates the ZikiMall "payment confirmed" callback. */
  simulatePaymentConfirmed(leadId: string): Promise<void>;
  getSigningSession(leadId: string, returnUrl: string): Promise<SigningSession>;
  /** DEV ONLY: simulates the DocuSign Connect envelope-completed webhook. */
  simulateSigningCompleted(leadId: string): Promise<void>;
  activatePortal(leadId: string, method: { kind: "password"; password: string } | { kind: "magic_link" }): Promise<void>;

  // Staff
  staffSession(): Promise<StaffSession | null>;
  staffSignIn(email: string, password: string): Promise<void>;
  staffSignOut(): Promise<void>;
  listLeads(): Promise<Lead[]>;
  listReviewLog(leadId: string): Promise<IdReviewLogEntry[]>;
  /** Short-lived signed URL (or in-memory object URL in mock mode). Staff only. */
  getIdDocumentUrl(path: string): Promise<string | null>;
  reviewId(leadId: string, decision: "approved" | "rejected", reason: string): Promise<void>;
  setOfficialUse(leadId: string, value: Omit<OfferOfficialUse, "updatedBy" | "updatedAt">): Promise<void>;
  listOutbox(): Promise<OutboxEmailRecord[]>;
  resetDemo?(): Promise<void>;
}
