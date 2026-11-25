import { describe, expect, it } from "vitest";
import { renderStandardEmail, progressBarHtml } from "@shared/domain/email-html.ts";
import { buildEmailProps, EMAIL_TEMPLATE_KEYS, EMAIL_SIGN_OFF } from "@shared/domain/emails.ts";
import { currentStep } from "@shared/domain/flow.ts";
import { DuplicateStandRecordError, createMockIntegrations, prepopulatePortalRecords, StandKeyedStore } from "@shared/domain/integrations.ts";
import type { ApplyPaymentInput } from "@shared/domain/iveri.ts";
import { handlePaymentConfirmed, type PaymentEventStore } from "@shared/domain/payment-events.ts";
import { progressFor } from "@shared/domain/progress.ts";
import { reportCounts, reportCsv, reportStatus } from "@shared/domain/report.ts";
import type { Lead, OfferSubmission, Stand } from "@shared/domain/types.ts";

const offer = {
  buyer: { fullName: "Tariro Moyo", email: "tariro@example.com", phone: "+263 77 123 4567", idNumber: "63-446236 Z 61" },
  coOwners: [],
  submittedAt: "2026-11-25T10:05:00Z",
} as unknown as OfferSubmission & { submittedAt: string };

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    createdAt: "2026-11-25T10:00:00Z",
    stage: "form_filled",
    contact: { fullName: "Tariro Moyo", email: "tariro@example.com", phone: "+263 77 123 4567" },
    standNumber: "3076",
    offer,
    officialUse: null,
    paidAt: null,
    paymentReference: null,
    paymentAmountCents: null,
    portalStatus: "not_started",
    portalRecords: null,
    envelopeId: null,
    signedAt: null,
    ...over,
  };
}

const availableStand = (n = "3076"): Stand => ({ standNumber: n, phase: "3", landUse: "Residential", sizeSqm: 1500, status: "available", reservedLeadId: null });

/** In-memory store whose commit applies every change together, like the SQL transaction. */
function memoryStore(leads: Lead[], stands: Stand[]) {
  const state = { leads, stands, refs: new Map<string, string>(), emails: [] as { leadId: string; template: string }[], commits: 0 };
  const store: PaymentEventStore = {
    isProcessed: (r) => state.refs.has(r),
    lead: (id) => state.leads.find((l) => l.id === id) ?? null,
    stand: (n) => state.stands.find((s) => s.standNumber === n) ?? null,
    commit: ({ reference, outcome, stand, lead, emailFor }) => {
      state.commits++;
      state.refs.set(reference, outcome.status);
      if (stand) state.stands = state.stands.map((s) => (s.standNumber === stand.standNumber ? stand : s));
      if (lead) state.leads = state.leads.map((l) => (l.id === lead.id ? lead : l));
      if (emailFor) state.emails.push({ leadId: emailFor.id, template: "payment_thank_you" });
    },
  };
  return { state, store };
}

const iveriEvent = (over: Partial<ApplyPaymentInput> = {}): ApplyPaymentInput => ({
  reference: "LC3076-TEST0001",
  leadId: "lead-1",
  standNumber: "3076",
  amountCents: 225000,
  paidAt: "2026-11-25T12:00:00.000Z",
  source: "mock-iveri",
  ...over,
});

describe("payment-confirmed handler (iVeri AuthoriseInfo status 0 only)", () => {
  const event = iveriEvent();

  it("success takes the stand out of inventory, queues exactly one email and advances to the portal step", () => {
    const { state, store } = memoryStore([makeLead()], [availableStand()]);
    const out = handlePaymentConfirmed(store, event);
    expect(out).toEqual({ status: "applied", leadId: "lead-1", standNumber: "3076", nextStep: "portal", emailQueued: "payment_thank_you" });
    expect(state.stands[0].status).toBe("paid");
    expect(state.stands[0].reservedLeadId).toBe("lead-1");
    expect(state.emails).toEqual([{ leadId: "lead-1", template: "payment_thank_you" }]);
    expect(state.leads[0]).toMatchObject({ stage: "paid", paymentReference: "LC3076-TEST0001", paymentAmountCents: 225000, paidAt: "2026-11-25T12:00:00.000Z" });
    expect(currentStep(state.leads[0])).toBe("portal");
    expect(state.commits).toBe(1);
  });

  it("a duplicate payment reference is a no-op", () => {
    const { state, store } = memoryStore([makeLead()], [availableStand()]);
    handlePaymentConfirmed(store, event);
    const snapshot = structuredClone({ leads: state.leads, stands: state.stands, emails: state.emails });
    expect(handlePaymentConfirmed(store, event)).toEqual({ status: "duplicate", reference: "LC3076-TEST0001" });
    expect({ leads: state.leads, stands: state.stands, emails: state.emails }).toEqual(snapshot);
    expect(state.emails).toHaveLength(1);
    expect(state.commits).toBe(1);
  });

  it("rejects a wrong amount and changes nothing but the reference log", () => {
    const { state, store } = memoryStore([makeLead()], [availableStand()]);
    const out = handlePaymentConfirmed(store, { ...event, reference: "ZM-TEST-2", amountCents: 100000 });
    expect(out.status).toBe("rejected");
    expect(state.stands[0].status).toBe("available");
    expect(state.leads[0].stage).toBe("form_filled");
    expect(state.emails).toHaveLength(0);
  });

  it("is keyed by stand number: a reference for another stand than the lead's is recorded as unmatched", () => {
    const { state, store } = memoryStore([makeLead()], [availableStand(), availableStand("3077")]);
    const out = handlePaymentConfirmed(store, { ...event, reference: "ZM-TEST-3", standNumber: "3077" });
    expect(out.status).toBe("unmatched");
    expect(state.refs.get("ZM-TEST-3")).toBe("unmatched");
    expect(state.leads[0].stage).toBe("form_filled");
    expect(state.stands.map((s) => s.status)).toEqual(["available", "available"]);
    expect(state.emails).toHaveLength(0);
  });

  it("only applies to the paying lead, even with two open offers on one stand", () => {
    const leads = [makeLead(), makeLead({ id: "lead-2", contact: { fullName: "Rudo Chari", email: "r@example.com", phone: "+263 77 000 0000" } })];
    const { state, store } = memoryStore(leads, [availableStand()]);
    expect(handlePaymentConfirmed(store, { ...event, leadId: "lead-2" })).toMatchObject({ status: "applied", leadId: "lead-2" });
    expect(state.leads.find((l) => l.id === "lead-1")!.stage).toBe("form_filled");
  });

  it("records a second payment for a stand that already left inventory as unmatched, with a trace", () => {
    const { state, store } = memoryStore([makeLead()], [{ ...availableStand(), status: "paid", reservedLeadId: "other" }]);
    expect(handlePaymentConfirmed(store, { ...event, reference: "ZM-TEST-4" }).status).toBe("unmatched");
    expect(state.refs.get("ZM-TEST-4")).toBe("unmatched");
    expect(state.stands[0]).toMatchObject({ status: "paid", reservedLeadId: "other" });
    expect(state.emails).toHaveLength(0);
  });
});

describe("Valerie's report statuses", () => {
  it("moves Signed up -> Signed up and Paid -> Signed up, Paid and Signed", () => {
    expect(reportStatus(makeLead({ offer: null }))).toBeNull();
    expect(reportStatus(makeLead())).toBe("signed_up");
    expect(reportStatus(makeLead({ stage: "paid" }))).toBe("signed_up_paid");
    expect(reportStatus(makeLead({ stage: "signed" }))).toBe("signed_up_paid_signed");
  });

  it("follows the payment handler: a confirmed payment flips the lead to Signed up and Paid", () => {
    const { state, store } = memoryStore([makeLead()], [availableStand()]);
    handlePaymentConfirmed(store, iveriEvent({ reference: "LC3076-R" }));
    expect(reportStatus(state.leads[0])).toBe("signed_up_paid");
  });

  it("counts each lead once and leaves applications without an offer out", () => {
    const leads = [makeLead({ offer: null }), makeLead(), makeLead(), makeLead({ stage: "paid" }), makeLead({ stage: "signed" })];
    expect(reportCounts(leads)).toEqual({ signed_up: 2, signed_up_paid: 1, signed_up_paid_signed: 1, notInReport: 1 });
  });

  it("exports a CSV with the status label, no ID numbers, and formula-safe cells", () => {
    const csv = reportCsv(
      [makeLead({ stage: "paid", contact: { fullName: "=HYPERLINK(1)", email: "a@b.co", phone: "1" }, offer: { ...offer, buyer: { ...offer.buyer, fullName: "=HYPERLINK(1)" } } })],
      [availableStand()],
    );
    expect(csv).toContain("Signed up and Paid");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).not.toContain("446236");
  });
});

describe("stand number is the unique key in the adapters", () => {
  const paid = makeLead({ stage: "paid", paidAt: "2026-11-25T12:00:00Z", paymentReference: "ZM-1", paymentAmountCents: 225000 });
  const input = { lead: paid, stand: { ...availableStand(), status: "paid" as const }, now: new Date("2026-11-25T12:00:00Z") };

  it("keys every record by stand number", () => {
    const r = prepopulatePortalRecords(input);
    expect(r.collectionSchedule.accountId).toBe("MOCK-CS-3076");
    expect(r.masterSchedule.rowId).toBe("MOCK-MS-3076");
    expect(r.odoo.partner.ref).toBe("MOCK-ODOO-PARTNER-3076");
    expect(r.odoo.account.ref).toBe("MOCK-ODOO-ACC-3076");
    expect(r.odoo.payment.ref).toBe("MOCK-ODOO-PAY-3076");
  });

  it("upserts the same buyer again without creating a second record", () => {
    const adapters = createMockIntegrations();
    prepopulatePortalRecords(input, adapters);
    prepopulatePortalRecords(input, adapters);
    expect(adapters.stores.collectionSchedule.size).toBe(1);
    expect(adapters.stores.masterSchedule.size).toBe(1);
    expect(adapters.stores.odoo.size).toBe(1);
  });

  it("rejects a second buyer on a stand that already has records", () => {
    const first = { ...paid, portalRecords: prepopulatePortalRecords(input) };
    const adapters = createMockIntegrations([first]);
    expect(() => prepopulatePortalRecords({ ...input, lead: { ...paid, id: "lead-2" } }, adapters)).toThrow(DuplicateStandRecordError);
  });

  it("refuses a stand that does not match the application", () => {
    expect(() => prepopulatePortalRecords({ ...input, stand: { ...input.stand, standNumber: "3077" } })).toThrow();
  });

  it("trims the key", () => {
    const store = new StandKeyedStore<number>("Test");
    store.upsert(" 3076 ", "a", 1);
    expect(store.get("3076")).toBe(1);
    expect(() => store.upsert("3076", "b", 2)).toThrow(DuplicateStandRecordError);
  });
});

describe("Progress of your purchase", () => {
  const states = (l: Lead) => progressFor(l).map((s) => s.state);

  it("reflects the lead's status", () => {
    expect(states(makeLead({ offer: null }))).toEqual(["current", "pending", "pending", "pending"]);
    expect(states(makeLead())).toEqual(["done", "current", "pending", "pending"]);
    expect(states(makeLead({ stage: "paid" }))).toEqual(["done", "done", "current", "pending"]);
    expect(states(makeLead({ stage: "signed" }))).toEqual(["done", "done", "done", "current"]);
    expect(states(makeLead({ stage: "signed", portalStatus: "prepopulated" }))).toEqual(["done", "done", "done", "done"]);
  });

  it("pay-but-not-sign with a portal: Signed is the current stage, Portal active is ticked", () => {
    expect(states(makeLead({ stage: "paid", portalStatus: "prepopulated" }))).toEqual(["done", "done", "current", "done"]);
  });

  it("renders as a table with ticks for done stages and one highlighted current stage", () => {
    const html = progressBarHtml(progressFor(makeLead({ stage: "paid" })));
    expect(html).toContain("<table");
    expect(html).not.toMatch(/display:\s*flex|<script/i);
    expect(html.match(/data-state="done"/g)).toHaveLength(2);
    expect(html.match(/data-state="current"/g)).toHaveLength(1);
    expect(html.match(/&#10003;/g)).toHaveLength(2);
    expect(html).toMatch(/data-stage="signed" data-state="current"/);
    expect(html).toContain("#DDA23C");
  });
});

describe("standard HTML email template v4", () => {
  const stand = { ...availableStand(), status: "paid" as const };
  const urls = { appUrl: "http://127.0.0.1:8137", portalUrl: "https://lakecity.standledger.io" };

  it.each(EMAIL_TEMPLATE_KEYS)("%s uses the v4 skeleton, the progress bar and the LakeCity Accounts sign-off", (key) => {
    const lead = makeLead({ stage: key === "offer_completed" ? "form_filled" : "paid", paymentReference: "ZM-1", paymentAmountCents: 225000, paidAt: "2026-11-25T12:00:00Z" });
    const html = renderStandardEmail(key, buildEmailProps(lead, stand, urls));
    for (const token of ["#0B412F", "#DDA23C", "#B3CCC3", "#F5F5F5", "#FAF8F5", "Playfair Display", "Inter", "max-width:600px", "logo-wordmark-white.png", "v:roundrect", "Customer Care"]) {
      expect(html).toContain(token);
    }
    for (const cls of ["wrap", "pad", "cell", "logo"]) expect(html).toContain(`.${cls}{`);
    expect(html).toContain(EMAIL_SIGN_OFF);
    expect(EMAIL_SIGN_OFF).toBe("LakeCity Accounts");
    expect(html).toContain("accounts@lakecity.co.zw");
    expect(html.indexOf("Progress of your purchase")).toBeGreaterThan(html.indexOf("Customer Care"));
    expect(html.indexOf("Progress of your purchase")).toBeLessThan(html.indexOf("Dear "));
    expect(html).not.toContain("446236");
    expect(html).not.toMatch(/\d{8,}/);
  });

  it("the bar in each email follows the lead: offer email has Paid current, thank-you email has Signed current", () => {
    const offerHtml = renderStandardEmail("offer_completed", buildEmailProps(makeLead(), stand, urls));
    expect(offerHtml).toMatch(/data-stage="paid" data-state="current"/);
    const paidHtml = renderStandardEmail("payment_thank_you", buildEmailProps(makeLead({ stage: "paid" }), stand, urls));
    expect(paidHtml).toMatch(/data-stage="signed" data-state="current"/);
  });

  it("shows prices incl. 15.5% VAT and escapes customer-typed text", () => {
    const lead = makeLead({ contact: { fullName: "<b>Eve</b>", email: "e@x.co", phone: "1" }, offer: { ...offer, buyer: { ...offer.buyer, fullName: "<b>Eve</b>" } } });
    const html = renderStandardEmail("offer_completed", buildEmailProps(lead, stand, urls));
    expect(html).toContain("incl. 15.5% VAT");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(html).not.toContain("<b>Eve</b>");
  });
});
