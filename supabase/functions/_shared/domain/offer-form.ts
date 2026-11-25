// Offer to Purchase, mirroring LakeCity's blank "General Offer Form - September 2025".
// Acknowledgement copy is PLACEHOLDER: it paraphrases the form's meaning and needs QC + approval.

import { CAMPAIGN } from "./campaign.ts";
import type { OfferForm } from "./types.ts";

export interface Acknowledgement {
  key: string;
  text: string;
}

export function offerAcknowledgements(termMonths: number = CAMPAIGN.termMonths): Acknowledgement[] {
  return [
    {
      key: "aos_fee",
      text: `I/We acknowledge that a non-refundable Agreement of Sale preparation fee of USD ${CAMPAIGN.aosFeeUsd} is payable to ${CAMPAIGN.aosFeePayee}.`,
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

export function validateOfferForm(o: Omit<OfferForm, "submittedAt">): OfferFormErrors {
  const e: OfferFormErrors = {};
  const nok = o.nextOfKin;
  if (!nok.fullName.trim()) e["nextOfKin.fullName"] = "Next of kin full name is required.";
  if (!isoDate.test(nok.dateOfBirth)) e["nextOfKin.dateOfBirth"] = "Next of kin date of birth is required.";
  if (!nok.idNumber.trim()) e["nextOfKin.idNumber"] = "Next of kin ID number is required.";
  if (!nok.residentialAddress.trim()) e["nextOfKin.residentialAddress"] = "Next of kin residential address is required.";
  if (!nok.cellPhone.trim()) e["nextOfKin.cellPhone"] = "Next of kin cell number is required.";
  if (nok.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nok.email)) e["nextOfKin.email"] = "Enter a valid email.";
  if (o.termMonths !== CAMPAIGN.termMonths) e.termMonths = `Term must be ${CAMPAIGN.termMonths} months.`;
  if (o.depositInstalments !== 1 && o.depositInstalments !== 3) e.depositInstalments = "Choose 1 or 3 deposit payments.";
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
