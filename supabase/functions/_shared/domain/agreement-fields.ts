// Single source of truth for the Agreement of Sale merge fields.
// PARKED: the Agreement of Sale / DocuSign step is not part of the core wizard; where it sits in the
// flow is OI-TBC-13. The template PDF must contain AcroForm text fields with exactly these names.
// Signature placement uses DocuSign anchor strings (see SIGNATURE_ANCHORS) printed in the template.

import { countryName } from "./countries.ts";
import { ID_TYPE_LABELS } from "./id-validation.ts";
import { CAMPAIGN, quoteForSize } from "./campaign.ts";
import { formatCents } from "./schedule.ts";
import type { Lead, Stand } from "./types.ts";

export const AGREEMENT_TEMPLATE_PATH = "/templates/agreement-of-sale-PLACEHOLDER.pdf";

export interface MergeField {
  key: string;
  label: string;
  /** Where the value is captured in the app (used for the README mapping table). */
  source: string;
}

export const MERGE_FIELDS: MergeField[] = [
  { key: "agreement_date", label: "Agreement date", source: "System: date the envelope is created" },
  { key: "buyer_full_name", label: "Buyer full name", source: "Offer form › Purchaser › Full name" },
  { key: "buyer_dob", label: "Buyer date of birth", source: "Offer form › Purchaser › Date of birth" },
  { key: "buyer_id_type", label: "Buyer ID type", source: "Offer form › Purchaser › ID type (National ID / Passport)" },
  { key: "buyer_id_country", label: "Buyer ID issuing country", source: "Offer form › Purchaser › Issuing country" },
  { key: "buyer_id_number", label: "Buyer ID number", source: "Offer form › Purchaser › ID number" },
  { key: "buyer_id_expiry", label: "Buyer ID expiry", source: "Offer form › Purchaser › Expiry date" },
  { key: "buyer_postal_address", label: "Buyer postal address", source: "Offer form › Purchaser › Postal address" },
  { key: "buyer_physical_address", label: "Buyer physical address", source: "Offer form › Purchaser › Residential address" },
  { key: "buyer_country", label: "Buyer country of residence", source: "Offer form › Purchaser › Country of residence" },
  { key: "buyer_email", label: "Buyer email", source: "Stand page side pane › Email" },
  { key: "buyer_phone", label: "Buyer phone", source: "Stand page side pane › Phone" },
  { key: "co_owners", label: "Co-owner(s) details", source: "Offer form › Co-owners (name, ID, email, phone)" },
  { key: "stand_number", label: "Stand number", source: "Landing › stand selected" },
  { key: "stand_size", label: "Stand size (m²)", source: "Stand inventory › size_sqm (Marketing Campaign Tracker, col J)" },
  { key: "purchase_price", label: "Purchase price (USD)", source: "Computed: USD 45 × m², incl. 15.5% VAT" },
  { key: "deposit", label: "Down payment (USD)", source: "Campaign rule: USD 1,750 fixed" },
  { key: "instalment", label: "Monthly instalment (USD)", source: "Computed: (price - down payment) / 48" },
  { key: "term_months", label: "Term (months)", source: "Campaign config: 48 months" },
  { key: "payment_reference", label: "Payment reference", source: "iVeri card payment › merchant reference" },
  { key: "collection_account_id", label: "Collection schedule account", source: "Portal account step › collection schedule adapter" },
];

/** Anchor strings printed (in white) in the template; DocuSign places tabs on them. */
export const SIGNATURE_ANCHORS = {
  buyerSign: "/buyer_sign/",
  buyerDate: "/buyer_date/",
  coOwnerSign: (n: number) => `/coowner${n}_sign/`,
  coOwnerDate: (n: number) => `/coowner${n}_date/`,
};

/** LakeCity Offer Form requirements (per sales pack) and where each is captured. */
export const OFFER_FORM_REQUIREMENTS: { requirement: string; capturedBy: string }[] = [
  { requirement: "Purchaser(s) full name(s) (I/We)", capturedBy: "Offer form › Purchaser + each co-owner" },
  { requirement: "Purchaser D.O.B.", capturedBy: "Offer form › Date of birth (purchaser + each co-owner)" },
  { requirement: "Purchaser ID number", capturedBy: "Offer form › ID type, issuing country, ID number, expiry (typed; no photos in the core flow, OI-TBC-12)" },
  { requirement: "Residential address", capturedBy: "Offer form › Residential address" },
  { requirement: "Cell number", capturedBy: "Stand page side pane › Phone" },
  { requirement: "Business phone", capturedBy: "Offer form › Business phone (optional)" },
  { requirement: "Email", capturedBy: "Stand page side pane › Email" },
  { requirement: "Alternative residential/postal address", capturedBy: "Offer form › Postal address, Alternative address" },
  { requirement: "Next of kin: full name, D.O.B., ID number, residential address, cell", capturedBy: "Offer form › Next of kin (required)" },
  { requirement: "Next of kin: business phone, email, alternative/postal address", capturedBy: "Offer form › Next of kin (optional)" },
  { requirement: "Stand number", capturedBy: "Landing › stand selected, shown read-only" },
  { requirement: "Size", capturedBy: "Stand inventory › size_sqm (Marketing Campaign Tracker, col J)" },
  { requirement: "Price (USD)", capturedBy: "Computed USD 45 × m²" },
  { requirement: "Initial deposit (USD)", capturedBy: "Fixed USD 1,750 down payment (+ USD 500 legal fee due at start)" },
  { requirement: "Term in months", capturedBy: "Campaign config: 48" },
  { requirement: "Monthly payment (USD)", capturedBy: "Computed (price - 1,750) / 48" },
  { requirement: "Acknowledgements (AOS fee, min. instalment, re-allocation, non-refund on default, AOS fee, stamp duty + conveyancing)", capturedBy: "Offer form › 6 required checkboxes" },
  { requirement: "Co-owners", capturedBy: "Offer form › Co-owners (optional, up to 3)" },
  { requirement: "Signed at (place), date", capturedBy: "Offer form › Signed at, Date" },
  { requirement: "Purchaser signature + name", capturedBy: "Offer form › Typed or drawn signature + name" },
  { requirement: "Official use: stand confirmation, checked by, signature, date", capturedBy: "Internal lead page only (staff)" },
];

export function buildMergeValues(lead: Lead, stand: Stand, now: Date = new Date()): Record<string, string> {
  if (!lead.offer) throw new Error("Offer form has not been submitted.");
  if (!stand.sizeSqm) throw new Error("Stand size is unknown.");
  const b = lead.offer.buyer;
  const q = quoteForSize(stand.sizeSqm, lead.offer.termMonths ?? CAMPAIGN.termMonths);
  const coOwners = lead.offer.coOwners.length
    ? lead.offer.coOwners
        .map(
          (c, i) =>
            `${i + 1}. ${c.fullName} (DOB ${c.dateOfBirth}) - ${ID_TYPE_LABELS[c.idType]} (${countryName(c.idIssuingCountry)}) ${c.idNumber} - ${c.email} - ${c.phone}`,
        )
        .join("\n")
    : "None";
  return {
    agreement_date: now.toISOString().slice(0, 10),
    buyer_full_name: b.fullName,
    buyer_dob: b.dateOfBirth,
    buyer_id_type: ID_TYPE_LABELS[b.idType],
    buyer_id_country: countryName(b.idIssuingCountry),
    buyer_id_number: b.idNumber,
    buyer_id_expiry: b.idExpiry ?? "N/A",
    buyer_postal_address: b.postalAddress,
    buyer_physical_address: b.physicalAddress,
    buyer_country: countryName(b.country),
    buyer_email: lead.contact.email,
    buyer_phone: lead.contact.phone,
    co_owners: coOwners,
    stand_number: stand.standNumber,
    stand_size: `${stand.sizeSqm} m²`,
    purchase_price: formatCents(q.priceCents),
    deposit: formatCents(q.downPaymentCents),
    instalment: formatCents(q.monthlyCents),
    term_months: String(q.termMonths),
    payment_reference: lead.paymentReference ?? "",
    collection_account_id: lead.portalRecords?.collectionSchedule.accountId ?? "",
  };
}
