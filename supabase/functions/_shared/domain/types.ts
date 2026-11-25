import type { IdType } from "./id-validation.ts";

export type StandStatus = "available" | "paid" | "signed";
/** The three lead lists. */
export type LeadStage = "form_filled" | "paid" | "signed";
export type IdReviewStatus = "id_pending_review" | "approved" | "rejected";
export type PortalStatus = "not_created" | "created" | "activated";

export interface Stand {
  standNumber: string;
  /** TBC: sizes not yet supplied by LakeCity. */
  sizeSqm: number | null;
  /** VAT-inclusive total price. TBC: not yet supplied by LakeCity. */
  priceUsd: number | null;
  depositUsd: number | null;
  status: StandStatus;
  reservedLeadId: string | null;
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
  /** Storage object paths in the PRIVATE id-documents bucket (never public URLs). */
  idFrontPath: string | null;
  idBackPath: string | null;
}

export interface CoOwner extends PersonIdentity {
  id: string;
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

export interface OfferForm {
  businessPhone: string;
  alternativeAddress: string;
  nextOfKin: NextOfKin;
  termMonths: number;
  depositInstalments: 1 | 3;
  acknowledgements: Record<string, boolean>;
  signedAtPlace: string;
  signedDate: string;
  signatureType: "typed" | "drawn";
  /** Typed name, or a PNG data URL for a drawn signature. */
  signatureValue: string;
  purchaserName: string;
  submittedAt: string;
}

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
  idReviewStatus: IdReviewStatus;
  idReviewReason: string | null;
  idReviewedBy: string | null;
  idReviewedAt: string | null;
  buyer: Buyer;
  coOwners: CoOwner[];
  standNumber: string;
  offer: OfferForm | null;
  officialUse: OfferOfficialUse | null;
  scheduleEmailedAt: string | null;
  scheduleAcceptedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  collectionAccountId: string | null;
  collectionAccountCreatedAt: string | null;
  portalStatus: PortalStatus;
  portalCreatedAt: string | null;
  portalActivatedAt: string | null;
  envelopeId: string | null;
  signedAt: string | null;
}

export interface IdReviewLogEntry {
  id: string;
  leadId: string;
  decision: "approved" | "rejected";
  reason: string | null;
  reviewer: string;
  createdAt: string;
}

export interface InventoryCounts {
  total: number;
  available: number;
  paid: number;
  signed: number;
}

export const MAX_CO_OWNERS = 3;
