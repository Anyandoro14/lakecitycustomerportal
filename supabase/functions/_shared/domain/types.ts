import type { IdType } from "./id-validation.ts";
import type { PortalRecords } from "./integrations.ts";

export type StandStatus = "available" | "paid" | "signed";
/** The three lead lists. "signed" is reserved for the Agreement of Sale step (OI-TBC-13). */
export type LeadStage = "form_filled" | "paid" | "signed";
/** prepopulated = collection schedule, master schedule and Odoo records drafted (mock adapters). */
export type PortalStatus = "not_started" | "prepopulated";

export interface Stand {
  standNumber: string;
  /** Mock sizes until LakeCity supplies real ones (OI-TBC-04). */
  sizeSqm: number | null;
  status: StandStatus;
  reservedLeadId: string | null;
}

/** Captured in the stand-select side pane. */
export interface Contact {
  fullName: string;
  email: string;
  phone: string;
}

export interface PersonIdentity {
  fullName: string;
  /** ISO date YYYY-MM-DD */
  dateOfBirth: string;
  email: string;
  phone: string;
  idType: IdType;
  idIssuingCountry: string;
  /** Normalised (upper-case, no separators). Personal data: never log. */
  idNumber: string;
  idExpiry: string | null;
}

export interface CoOwner extends PersonIdentity {
  position: number;
}

export interface Buyer extends PersonIdentity {
  /** Residential (physical) address. */
  physicalAddress: string;
  postalAddress: string;
  /** Country of residence (ISO alpha-2). */
  country: string;
}

export interface NextOfKin {
  fullName: string;
  dateOfBirth: string;
  idNumber: string;
  residentialAddress: string;
  cellPhone: string;
  businessPhone: string;
  email: string;
  alternativeAddress: string;
}

/** Digital General Offer Form (September 2025). */
export interface OfferForm {
  buyer: Buyer;
  coOwners: CoOwner[];
  businessPhone: string;
  alternativeAddress: string;
  nextOfKin: NextOfKin;
  termMonths: number;
  acknowledgements: Record<string, boolean>;
  signedAtPlace: string;
  signedDate: string;
  signatureType: "typed" | "drawn";
  /** Typed name, or a PNG data URL for a drawn signature. */
  signatureValue: string;
  purchaserName: string;
  submittedAt: string;
}

export type OfferSubmission = Omit<OfferForm, "submittedAt">;

/** LakeCity official-use block of the Offer Form; only shown on the internal staff page. */
export interface OfferOfficialUse {
  standConfirmed: boolean;
  checkedBy: string;
  signature: string;
  date: string;
  updatedBy: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  createdAt: string;
  stage: LeadStage;
  contact: Contact;
  standNumber: string;
  offer: OfferForm | null;
  officialUse: OfferOfficialUse | null;
  paidAt: string | null;
  paymentReference: string | null;
  paymentAmountCents: number | null;
  portalStatus: PortalStatus;
  portalRecords: PortalRecords | null;
  envelopeId: string | null;
  signedAt: string | null;
}

export interface InventoryCounts {
  total: number;
  available: number;
  paid: number;
  signed: number;
}

export const MAX_CO_OWNERS = 3;
