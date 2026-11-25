// Single source of truth for the Agreement of Sale merge fields.
// The template PDF must contain AcroForm text fields with exactly these names; the lead-api edge
// function (signing-session) fills them with pdf-lib and flattens the form before sending the envelope.
// Signature placement uses DocuSign anchor strings (see SIGNATURE_ANCHORS) printed in the template.

import { countryName } from "./countries.ts";
import { ID_TYPE_LABELS } from "./id-validation.ts";
import { CAMPAIGN, resolvePricing } from "./campaign.ts";
import { computeSchedule, formatCents } from "./schedule.ts";
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
  { key: "buyer_full_name", label: "Buyer full name", source: "Step 1 Intake › Full name" },
  { key: "buyer_dob", label: "Buyer date of birth", source: "Step 1 Intake › Date of birth" },
  { key: "buyer_id_type", label: "Buyer ID type", source: "Step 1 Intake › ID type (National ID / Passport)" },
  { key: "buyer_id_country", label: "Buyer ID issuing country", source: "Step 1 Intake › Issuing country" },
  { key: "buyer_id_number", label: "Buyer ID number", source: "Step 1 Intake › ID number" },
  { key: "buyer_id_expiry", label: "Buyer ID expiry", source: "Step 1 Intake › Expiry date" },
  { key: "buyer_postal_address", label: "Buyer postal address", source: "Step 1 Intake › Postal address" },
  { key: "buyer_physical_address", label: "Buyer physical address", source: "Step 1 Intake › Physical address" },
  { key: "buyer_country", label: "Buyer country of residence", source: "Step 1 Intake › Country of residence" },
  { key: "buyer_email", label: "Buyer email", source: "Step 1 Intake › Email" },
  { key: "buyer_phone", label: "Buyer phone", source: "Step 1 Intake › Phone" },
  { key: "co_owners", label: "Co-owner(s) details", source: "Step 1 Intake › Co-owners (name, ID, email, phone)" },
  { key: "stand_number", label: "Stand number", source: "Step 1 Intake › Stand" },
  { key: "stand_size", label: "Stand size (m²)", source: "Stand inventory › size_sqm (TBC), shown on Offer form" },
  { key: "purchase_price", label: "Purchase price (USD, VAT incl.)", source: "Stand inventory › price_usd (TBC), Offer form › Price" },
  { key: "deposit", label: "Initial deposit (USD)", source: "Stand inventory › deposit_usd (TBC), Offer form › Initial deposit" },
  { key: "instalment", label: "Monthly instalment (USD)", source: "Computed: (price - deposit) / term, Offer form + Payment schedule" },
  { key: "term_months", label: "Term (months)", source: "Campaign config: 48 months, Offer form › Term" },
  { key: "payment_reference", label: "Deposit payment reference", source: "ZikiMall payment callback › payment reference" },
  { key: "collection_account_id", label: "Collection schedule account", source: "Created by backend after payment confirmed" },
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
  { requirement: "Purchaser(s) full name(s) (I/We)", capturedBy: "Intake › Full name (buyer + each co-owner)" },
  { requirement: "Purchaser D.O.B.", capturedBy: "Intake › Date of birth (buyer + each co-owner)" },
  { requirement: "Purchaser ID number", capturedBy: "Intake › ID type, issuing country, ID number, expiry, photo(s)" },
  { requirement: "Residential address", capturedBy: "Intake › Physical (residential) address" },
  { requirement: "Cell number", capturedBy: "Intake › Phone" },
  { requirement: "Business phone", capturedBy: "Offer form › Business phone (optional)" },
  { requirement: "Email", capturedBy: "Intake › Email" },
  { requirement: "Alternative residential/postal address", capturedBy: "Intake › Postal address, Offer form › Alternative address" },
  { requirement: "Next of kin: full name, D.O.B., ID number, residential address, cell", capturedBy: "Offer form › Next of kin (required)" },
  { requirement: "Next of kin: business phone, email, alternative/postal address", capturedBy: "Offer form › Next of kin (optional)" },
  { requirement: "Stand number", capturedBy: "Intake › Stand dropdown, shown read-only on Offer form" },
  { requirement: "Size", capturedBy: "Stand inventory › size_sqm (TBC), shown on Offer form" },
  { requirement: "Price (USD)", capturedBy: "Stand inventory › price_usd (TBC, VAT incl.), Offer form" },
  { requirement: "Initial deposit (USD)", capturedBy: "Stand inventory › deposit_usd (TBC), Offer form (+ option: pay in 3)" },
  { requirement: "Term in months", capturedBy: "Campaign config: 48, Offer form" },
  { requirement: "Monthly payment (USD)", capturedBy: "Computed (price - deposit) / 48, Offer form + schedule" },
  { requirement: "Acknowledgements (AOS fee, min. instalment, re-allocation, non-refund on default, AOS fee, stamp duty + conveyancing)", capturedBy: "Offer form › 6 required checkboxes" },
  { requirement: "Co-owners", capturedBy: "Intake › Co-owners (optional, up to 3, each with own name, DOB, ID + photo, email, phone)" },
  { requirement: "Signed at (place), date", capturedBy: "Offer form › Signed at, Date" },
  { requirement: "Purchaser signature + name", capturedBy: "Offer form › Typed or drawn signature + name; Agreement: DocuSign (buyer + co-owners)" },
  { requirement: "Official use: stand confirmation, checked by, signature, date", capturedBy: "Internal lead page only (staff)" },
];

export function buildMergeValues(lead: Lead, stand: Stand, now: Date = new Date()): Record<string, string> {
  const b = lead.buyer;
  const pricing = resolvePricing(stand);
  const tag = pricing.isPlaceholder ? " (PLACEHOLDER - price TBC)" : "";
  const schedule = computeSchedule({
    priceUsd: pricing.priceUsd,
    depositUsd: pricing.depositUsd,
    termMonths: lead.offer?.termMonths ?? CAMPAIGN.termMonths,
    depositInstalments: lead.offer?.depositInstalments ?? 1,
    dueDay: CAMPAIGN.dueDay,
    startDate: (lead.offer?.submittedAt ?? now.toISOString()).slice(0, 10),
  });
  const coOwners = lead.coOwners.length
    ? lead.coOwners
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
    buyer_email: b.email,
    buyer_phone: b.phone,
    co_owners: coOwners,
    stand_number: stand.standNumber,
    stand_size: pricing.sizeSqm === null ? "TBC" : `${pricing.sizeSqm} m²${tag}`,
    purchase_price: formatCents(schedule.totalCents) + tag,
    deposit: formatCents(schedule.depositCents) + tag,
    instalment: formatCents(schedule.monthlyInstalmentCents) + tag,
    term_months: String(schedule.termMonths),
    payment_reference: lead.paymentReference ?? "",
    collection_account_id: lead.collectionAccountId ?? "",
  };
}
