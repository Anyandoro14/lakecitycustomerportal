import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "@/emails/templates";
import { validateContact } from "@shared/domain/contact.ts";
import { buildEmailProps, emailsLive } from "@shared/domain/emails.ts";
import { currentStep } from "@shared/domain/flow.ts";
import { matchesPortalCredentials, prepopulatePortalRecords } from "@shared/domain/integrations.ts";
import { validateOfferForm } from "@shared/domain/offer-form.ts";
import type { Lead, OfferSubmission, Stand } from "@shared/domain/types.ts";

const stand: Stand = { standNumber: "3041", phase: "3", landUse: "Residential", sizeSqm: 500, status: "paid", reservedLeadId: "lead-1" };

const offer: OfferSubmission = {
  buyer: {
    fullName: "Tariro Moyo",
    dateOfBirth: "1990-04-02",
    email: "tariro@example.com",
    phone: "+263 77 123 4567",
    idType: "national_id",
    idIssuingCountry: "ZW",
    idNumber: "63-446236 Z 61",
    idExpiry: null,
    physicalAddress: "12 Example Road, Harare",
    postalAddress: "12 Example Road, Harare",
    country: "ZW",
  },
  coOwners: [],
  businessPhone: "",
  alternativeAddress: "",
  nextOfKin: { fullName: "Rudo Moyo", dateOfBirth: "1965-01-01", idNumber: "X", residentialAddress: "Harare", cellPhone: "+263 77 000 0000", businessPhone: "", email: "", alternativeAddress: "" },
  termMonths: 48,
  acknowledgements: { aos_fee: true, min_instalment: true, reallocation: true, non_refundable_on_default: true, aos_fee_payment: true, stamp_duty_conveyancing: true },
  signedAtPlace: "Harare",
  signedDate: "2026-11-25",
  signatureType: "typed",
  signatureValue: "Tariro Moyo",
  purchaserName: "Tariro Moyo",
};

const lead: Lead = {
  id: "0d6f4c1e-1111-2222-3333-444455556666",
  createdAt: "2026-11-25T10:00:00Z",
  stage: "paid",
  contact: { fullName: "Tariro Moyo", email: "tariro@example.com", phone: "+263 77 123 4567" },
  standNumber: "3041",
  offer: { ...offer, submittedAt: "2026-11-25T10:05:00Z" },
  officialUse: null,
  paidAt: "2026-11-25T10:10:00Z",
  paymentReference: "ZM-SIM-ABC",
  paymentAmountCents: 225000,
  portalStatus: "not_started",
  portalRecords: null,
  envelopeId: null,
  signedAt: null,
};

describe("customer flow", () => {
  it("validates the side-pane contact details", () => {
    expect(validateContact({ fullName: "Tariro Moyo", email: "tariro@example.com", phone: "+263 77 123 4567" })).toEqual({});
    expect(Object.keys(validateContact({ fullName: "", email: "x", phone: "12" }))).toEqual(["fullName", "email", "phone"]);
  });

  it("accepts a complete offer and rejects a missing purchaser ID", () => {
    expect(validateOfferForm(offer)).toEqual({});
    expect(validateOfferForm({ ...offer, buyer: { ...offer.buyer, idNumber: "" } })["buyer.idNumber"]).toBeDefined();
  });

  it("orders the steps offer -> payment -> celebration/portal", () => {
    expect(currentStep({ ...lead, stage: "form_filled", offer: null })).toBe("offer");
    expect(currentStep({ ...lead, stage: "form_filled" })).toBe("payment");
    expect(currentStep(lead)).toBe("portal");
  });
});

describe("portal account step (mock adapters)", () => {
  it("matches stand number + phone, ignoring phone formatting", () => {
    expect(matchesPortalCredentials(lead, "3041", "0771234567")).toBe(true);
    expect(matchesPortalCredentials(lead, " 3041 ", "+263771234567")).toBe(true);
    expect(matchesPortalCredentials(lead, "3042", "0771234567")).toBe(false);
    expect(matchesPortalCredentials(lead, "3041", "0779999999")).toBe(false);
  });

  it("pre-populates collection schedule, master schedule and Odoo records without writing anywhere", () => {
    const r = prepopulatePortalRecords({ lead, stand, now: new Date("2026-11-25T11:00:00Z") });
    expect(r.adapter).toBe("mock");
    expect(r.collectionSchedule.accountId).toBe("MOCK-CS-3041");
    expect(r.collectionSchedule.priceCents).toBe(22_500_00);
    expect(r.collectionSchedule.paidToDateCents).toBe(2_250_00);
    expect(r.collectionSchedule.rows).toHaveLength(49);
    expect(r.masterSchedule.collectionAccountId).toBe(r.collectionSchedule.accountId);
    expect(r.odoo.payment.amountCents).toBe(2_250_00);
    expect(r.odoo.partner.ref).toBe("MOCK-ODOO-PARTNER-3041");
  });

  it("keeps the legal fee out of the balance: price - paid toward price = balance", () => {
    const cs = prepopulatePortalRecords({ lead, stand, now: new Date("2026-11-25T11:00:00Z") }).collectionSchedule;
    expect(cs.paidTowardPriceCents).toBe(1_750_00);
    expect(cs.legalFeePaidCents).toBe(500_00);
    expect(cs.paidTowardPriceCents + cs.legalFeePaidCents).toBe(cs.paidToDateCents);
    expect(cs.priceCents - cs.paidTowardPriceCents).toBe(cs.balanceCents);
    const instalments = cs.rows.slice(1).reduce((sum, row) => sum + row.amountCents, 0);
    expect(instalments).toBe(cs.balanceCents);
  });
});

describe("thank-you email", () => {
  const props = buildEmailProps(lead, stand, { appUrl: "http://127.0.0.1:8137", portalUrl: "https://lakecity.standledger.io" });

  it("links back to the offer", () => {
    expect(props.offerUrl).toBe(`http://127.0.0.1:8137/apply/${lead.id}/offer`);
  });

  it("names the stand, uses the v4 template with the progress bar, and never includes ID numbers", async () => {
    const html = await renderEmailHtml("payment_thank_you", props);
    expect(html).toContain("stand <strong");
    expect(html).toContain(">3041</strong>");
    expect(html).toContain(props.offerUrl);
    expect(html).toContain("Progress of your purchase");
    expect(html).toContain("Payment received");
    expect(html).toContain("#0B412F");
    expect(html).toContain("#DDA23C");
    expect(html).not.toContain("446236");
    expect(html.toLowerCase()).not.toContain("password:");
  });

  it("stays in preview mode unless every live setting is present", () => {
    expect(emailsLive({})).toBe(false);
    expect(emailsLive({ EMAILS_LIVE: "true", EMAIL_PROVIDER: "resend" })).toBe(false);
  });
});
