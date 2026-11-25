// Local mock backend so the whole flow runs without Supabase. State is kept in localStorage so the
// demo survives reloads. Nothing here is sent anywhere: no money moves, no emails leave the browser,
// card payments go to a MOCK iVeri page (no card data, no gateway) and its result is
// processed by the same iVeri return handler the server uses, and portal records are built by MOCK
// adapters (keyed by stand number) without touching the real sheets or Odoo.

import seed from "@/data/stands.seed.json";
import { config } from "@/config";
import { CAMPAIGN, paymentDueNowCents } from "@shared/domain/campaign.ts";
import { EMAIL_ATTACHMENTS, buildEmailProps, emailSubject, type EmailTemplateKey } from "@shared/domain/emails.ts";
import { DuplicateStandRecordError, createMockIntegrations, matchesPortalCredentials, prepopulatePortalRecords } from "@shared/domain/integrations.ts";
import { handlePaymentConfirmed } from "@shared/domain/payment-events.ts";
import { newMerchantReference, processIveriReturn, type ApplyPaymentInput, type PaymentAttempt } from "@shared/domain/iveri.ts";
import { normaliseOffer, validateOfferForm } from "@shared/domain/offer-form.ts";
import { validateContact } from "@shared/domain/contact.ts";
import type { Backend, PaymentIssue, PaymentResultView } from "./types";
import type { Lead, OutboxEmailRecord, Stand } from "./models";

const STORAGE_KEY = "lakecity-mock-v5";
const MOCK_STAFF = "dev-staff@lakecity.local";

interface MockState {
  stands: Stand[];
  leads: Lead[];
  outbox: OutboxEmailRecord[];
  /** Payment references already handled (idempotency), with their outcome. */
  payments: { reference: string; standNumber: string; leadId: string | null; status: string; reason: string | null; at: string }[];
  paymentAttempts: PaymentAttempt[];
  /** What the mock iVeri page "answered" per reference (card status; null = cancelled). */
  mockGateway: Record<string, number | null>;
}

function freshState(): MockState {
  return {
    stands: seed.stands.map((s) => ({ standNumber: s.standNumber, sizeSqm: s.sizeSqm, phase: s.phase, landUse: s.landUse, status: "available", reservedLeadId: null })),
    leads: [],
    outbox: [],
    payments: [],
    paymentAttempts: [],
    mockGateway: {},
  };
}

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // fall through to a fresh state
  }
  return freshState();
}

let state = load();
const listeners = new Set<() => void>();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

export function subscribeMock(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function requireLead(leadId: string): Lead {
  const lead = state.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Application not found.");
  return lead;
}

function requireStand(standNumber: string): Stand {
  const stand = state.stands.find((s) => s.standNumber === standNumber);
  if (!stand) throw new Error("Stand not found.");
  return stand;
}

/** Preview outbox: records the email and logs metadata only (never the address, ID data or body). */
function queueEmail(template: EmailTemplateKey, lead: Lead) {
  const stand = requireStand(lead.standNumber);
  state.outbox.push({
    id: uid(),
    leadId: lead.id,
    template,
    to: lead.contact.email,
    subject: emailSubject(template, lead.standNumber),
    props: buildEmailProps(lead, stand, { appUrl: config.appUrl, portalUrl: config.portalUrl }),
    attachmentNames: EMAIL_ATTACHMENTS[template] ?? [],
    status: "queued_dev_only",
    createdAt: now(),
  });
  console.info(`[email:preview-outbox] queued "${template}" for lead ${lead.id.slice(0, 8)} (not sent)`);
}

/** Same handler as the server: the mock gateway plays AuthoriseInfo; only card status 0 applies the payment. */
async function mockReturn(leadId: string, reference: string, kind?: string): Promise<PaymentResultView> {
  const attempt = state.paymentAttempts.find((a) => a.reference === reference);
  if (!attempt || attempt.leadId !== leadId) throw new Error("We couldn't find this payment.");
  const outcome = await processIveriReturn(
    {
      getAttempt: async (ref) => structuredClone(state.paymentAttempts.find((a) => a.reference === ref) ?? null),
      authoriseInfo: async (ref) => {
        if (!(ref in state.mockGateway)) throw new Error("no answer yet");
        return { cardStatus: state.mockGateway[ref], description: "", trace: ref, amountCents: attempt.amountCents };
      },
      applyPayment: async (input) => applyMockPayment(input),
      markAttempt: async (ref, status, cardStatus) => {
        const a = state.paymentAttempts.find((x) => x.reference === ref);
        if (a) Object.assign(a, { status, cardStatus });
        save();
      },
      source: "mock-iveri",
    },
    { reference, kind },
  );
  return { reference, result: outcome.result, cardStatus: outcome.cardStatus, title: outcome.title, message: outcome.message };
}

/** Mirror of apply_payment_confirmed: one synchronous commit + one save(); all or nothing. */
function applyMockPayment(input: ApplyPaymentInput) {
  const outcome = handlePaymentConfirmed(
    {
      isProcessed: (ref) => state.payments.some((p) => p.reference === ref),
      lead: (id) => state.leads.find((l) => l.id === id) ?? null,
      stand: (n) => state.stands.find((s) => s.standNumber === n) ?? null,
      commit: ({ reference: ref, event, outcome: o, stand, lead: updated, emailFor }) => {
        const next = structuredClone(state);
        const reason = o.status === "unmatched" || o.status === "rejected" ? o.reason : null;
        const leadId = next.leads.some((l) => l.id === event.leadId) ? event.leadId : null;
        next.payments.push({ reference: ref, standNumber: event.standNumber, leadId, status: o.status, reason, at: now() });
        if (stand) next.stands = next.stands.map((s) => (s.standNumber === stand.standNumber ? stand : s));
        if (updated) next.leads = next.leads.map((l) => (l.id === updated.id ? updated : l));
        if (o.status === "applied") next.paymentAttempts = next.paymentAttempts.map((a) => (a.reference === ref ? { ...a, status: "approved", cardStatus: 0 } : a));
        const prev = state;
        state = next;
        try {
          if (emailFor) queueEmail("payment_thank_you", emailFor);
        } catch (e) {
          state = prev;
          throw e;
        }
      },
    },
    input,
  );
  save();
  return outcome.status;
}

export const mockBackend: Backend = {
  mode: "mock",

  async listStands() {
    await delay(150);
    return structuredClone(state.stands);
  },

  async startApplication({ standNumber, contact }) {
    await delay(400);
    const stand = requireStand(standNumber);
    if (stand.status !== "available") throw new Error("Sorry, this stand is no longer available.");
    const errors = validateContact(contact);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const lead: Lead = {
      id: uid(),
      createdAt: now(),
      stage: "form_filled",
      contact: { fullName: contact.fullName.trim(), email: contact.email.trim().toLowerCase(), phone: contact.phone.trim() },
      standNumber,
      offer: null,
      officialUse: null,
      paidAt: null,
      paymentReference: null,
      paymentAmountCents: null,
      portalStatus: "not_started",
      portalRecords: null,
      envelopeId: null,
      signedAt: null,
    };
    state.leads.push(lead);
    save();
    return { leadId: lead.id };
  },

  async getLead(leadId) {
    await delay(100);
    const lead = state.leads.find((l) => l.id === leadId);
    return lead ? structuredClone(lead) : null;
  },

  async submitOffer(leadId, offer) {
    await delay(400);
    const lead = requireLead(leadId);
    if (lead.stage !== "form_filled") throw new Error("This offer has already been paid for and can no longer be changed.");
    const errors = validateOfferForm(offer);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    lead.offer = { ...normaliseOffer(offer), termMonths: CAMPAIGN.termMonths, submittedAt: now() };
    queueEmail("offer_completed", lead);
    save();
  },

  async startPayment(leadId) {
    await delay(200);
    const lead = requireLead(leadId);
    if (!lead.offer) throw new Error("Complete the offer form first.");
    if (lead.stage !== "form_filled") throw new Error("This application has already been paid.");
    if (requireStand(lead.standNumber).status !== "available") throw new Error("Sorry, this stand is no longer available.");
    const attempt: PaymentAttempt = {
      reference: newMerchantReference(lead.standNumber),
      leadId,
      standNumber: lead.standNumber,
      amountCents: paymentDueNowCents(),
      status: "started",
      cardStatus: null,
      createdAt: now(),
    };
    state.paymentAttempts.push(attempt);
    save();
    return { kind: "mock", reference: attempt.reference, amountCents: attempt.amountCents };
  },

  async paymentResult(leadId, reference, kind) {
    await delay(300);
    return mockReturn(leadId, reference, kind);
  },

  async checkPayment(leadId) {
    await delay(300);
    const latest = state.paymentAttempts.filter((a) => a.leadId === leadId).at(-1);
    if (!latest) throw new Error("We couldn't find this payment.");
    return mockReturn(leadId, latest.reference);
  },

  async simulateCardResult(leadId, reference, cardStatus) {
    const attempt = state.paymentAttempts.find((a) => a.reference === reference);
    if (!attempt || attempt.leadId !== leadId) throw new Error("We couldn't find this payment.");
    state.mockGateway[reference] = cardStatus;
    save();
    return mockReturn(leadId, reference, cardStatus === 0 ? "success" : "fail");
  },

  async enrolPortal(leadId, input) {
    await delay(500);
    const lead = requireLead(leadId);
    if (lead.stage === "form_filled") throw new Error("Your payment has not been confirmed yet.");
    if (!matchesPortalCredentials(lead, input.standNumber, input.phone)) {
      throw new Error("The stand number and phone number don't match this application.");
    }
    if (lead.portalStatus !== "prepopulated") {
      // One record per stand number in each system: seed the mock adapters with the stand's existing records.
      const adapters = createMockIntegrations(state.leads.filter((l) => l.standNumber === lead.standNumber && l.portalRecords));
      try {
        lead.portalRecords = prepopulatePortalRecords({ lead, stand: requireStand(lead.standNumber), now: new Date() }, adapters);
      } catch (e) {
        if (e instanceof DuplicateStandRecordError) throw new Error(`Stand ${lead.standNumber} is already set up for another buyer. Please contact LakeCity.`);
        throw e;
      }
      lead.portalStatus = "prepopulated";
      queueEmail("portal_ready", lead);
    }
    save();
  },

  async staffSession() {
    return { email: MOCK_STAFF, isStaff: true };
  },
  async staffSignIn() {},
  async staffSignOut() {},

  async listLeads() {
    await delay(150);
    return structuredClone(state.leads).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async setOfficialUse(leadId, value) {
    const lead = requireLead(leadId);
    lead.officialUse = { ...value, updatedBy: MOCK_STAFF, updatedAt: now() };
    save();
  },

  async listOutbox() {
    return structuredClone(state.outbox).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async listPaymentIssues() {
    return state.payments
      .filter((p) => p.status === "unmatched" || p.status === "rejected")
      .map((p): PaymentIssue => ({ reference: p.reference, standNumber: p.standNumber, leadId: p.leadId, outcome: p.status as PaymentIssue["outcome"], reason: p.reason, createdAt: p.at }))
      .reverse();
  },

  async resetDemo() {
    state = freshState();
    save();
  },
};
