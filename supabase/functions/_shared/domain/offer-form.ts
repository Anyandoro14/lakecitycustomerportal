// Digital Offer to Purchase, mirroring LakeCity's blank "General Offer Form - September 2025".
// Acknowledgement copy is PLACEHOLDER: it paraphrases the form's meaning and needs QC + approval.

import { CAMPAIGN, PRICING } from "./campaign.ts";
import { isIsoCountry } from "./countries.ts";
import { validateIdentity } from "./id-validation.ts";
import { MAX_CO_OWNERS, type OfferSubmission, type PersonIdentity } from "./types.ts";

export interface Acknowledgement {
  key: string;
  text: string;
}

export function offerAcknowledgements(termMonths: number = CAMPAIGN.termMonths): Acknowledgement[] {
  return [
    {
      key: "aos_fee",
      text: `I/We acknowledge that a non-refundable Agreement of Sale preparation (legal) fee of USD ${PRICING.legalFeeUsd} is payable to ${CAMPAIGN.legalFeePayee}.`,
    },
    {
      key: "min_instalment",
      text: `I/We agree to pay at least the minimum monthly installment over ${termMonths} months.`,
    },
    {
      key: "reallocation",
      text: `I/We understand that the stand may be re-allocated (forfeited) if ${CAMPAIGN.consecutiveMissedPaymentsBeforeReallocation} consecutive monthly payments are missed.`,
    },
    {
      key: "non_refundable_on_default",
      text: "I/We understand that payments made are non-refundable where the purchaser has defaulted.",
    },
    {
      key: "aos_fee_payment",
      text: "I/We agree to pay the Agreement of Sale fee.",
    },
    {
      key: "stamp_duty_conveyancing",
      text: "I/We agree to pay statutory stamp duty and conveyancing fees for the transfer of title deed.",
    },
  ];
}

export type OfferFormErrors = Partial<Record<string, string>>;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePerson(p: PersonIdentity, prefix: string, e: OfferFormErrors) {
  if (p.fullName.trim().length < 3) e[`${prefix}.fullName`] = "Full name is required.";
  if (!isoDate.test(p.dateOfBirth)) e[`${prefix}.dateOfBirth`] = "Date of birth is required.";
  if (!EMAIL.test(p.email.trim())) e[`${prefix}.email`] = "Enter a valid email address.";
  if (p.phone.replace(/\D/g, "").length < 7) e[`${prefix}.phone`] = "Enter a valid phone number.";
  const id = validateIdentity({ idType: p.idType, issuingCountry: p.idIssuingCountry, idNumber: p.idNumber, expiryDate: p.idExpiry });
  if (id.errors.idType) e[`${prefix}.idType`] = id.errors.idType;
  if (id.errors.issuingCountry) e[`${prefix}.idIssuingCountry`] = id.errors.issuingCountry;
  if (id.errors.idNumber) e[`${prefix}.idNumber`] = id.errors.idNumber;
  if (id.errors.expiryDate) e[`${prefix}.idExpiry`] = id.errors.expiryDate;
}

export function validateOfferForm(o: OfferSubmission): OfferFormErrors {
  const e: OfferFormErrors = {};
  validatePerson(o.buyer, "buyer", e);
  if (o.buyer.physicalAddress.trim().length < 5) e["buyer.physicalAddress"] = "Enter your residential address.";
  if (o.buyer.postalAddress.trim().length < 5) e["buyer.postalAddress"] = "Enter your postal address (or repeat your residential address).";
  if (!isIsoCountry(o.buyer.country)) e["buyer.country"] = "Choose your country of residence.";
  if (o.coOwners.length > MAX_CO_OWNERS) e.coOwners = `At most ${MAX_CO_OWNERS} co-owners.`;
  o.coOwners.forEach((c, i) => validatePerson(c, `coOwner${i + 1}`, e));

  const nok = o.nextOfKin;
  if (!nok.fullName.trim()) e["nextOfKin.fullName"] = "Next of kin full name is required.";
  if (!isoDate.test(nok.dateOfBirth)) e["nextOfKin.dateOfBirth"] = "Next of kin date of birth is required.";
  if (!nok.idNumber.trim()) e["nextOfKin.idNumber"] = "Next of kin ID number is required.";
  if (!nok.residentialAddress.trim()) e["nextOfKin.residentialAddress"] = "Next of kin residential address is required.";
  if (!nok.cellPhone.trim()) e["nextOfKin.cellPhone"] = "Next of kin cell number is required.";
  if (nok.email && !EMAIL.test(nok.email)) e["nextOfKin.email"] = "Enter a valid email.";
  if (o.termMonths !== CAMPAIGN.termMonths) e.termMonths = `Term must be ${CAMPAIGN.termMonths} months.`;
  for (const a of offerAcknowledgements(o.termMonths)) {
    if (!o.acknowledgements[a.key]) e[`ack.${a.key}`] = "Please confirm this condition.";
  }
  if (!o.signedAtPlace.trim()) e.signedAtPlace = "Place of signing is required.";
  if (!isoDate.test(o.signedDate)) e.signedDate = "Date is required.";
  if (!o.purchaserName.trim()) e.purchaserName = "Purchaser name is required.";
  if (o.signatureType === "typed" && o.signatureValue.trim().length < 2) e.signatureValue = "Type your full name to sign.";
  if (o.signatureType === "drawn" && !o.signatureValue.startsWith("data:image/png")) e.signatureValue = "Draw your signature.";
  return e;
}

/** Returns a copy with ID numbers normalised (as validated). Call only after validateOfferForm passes. */
export function normaliseOffer(o: OfferSubmission): OfferSubmission {
  const norm = <T extends PersonIdentity>(p: T): T => {
    const v = validateIdentity({ idType: p.idType, issuingCountry: p.idIssuingCountry, idNumber: p.idNumber, expiryDate: p.idExpiry });
    return { ...p, fullName: p.fullName.trim(), email: p.email.trim().toLowerCase(), idNumber: v.normalized, idIssuingCountry: p.idIssuingCountry.toUpperCase(), idExpiry: p.idExpiry || null };
  };
  return {
    ...o,
    buyer: norm(o.buyer),
    coOwners: o.coOwners.map((c, i) => ({ ...norm(c), position: i + 1 })),
    termMonths: CAMPAIGN.termMonths,
  };
}
