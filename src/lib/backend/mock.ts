// Local mock backend so the whole flow runs without Supabase. State is kept in localStorage so the
// demo survives reloads. Nothing here is sent anywhere: no money moves, no emails leave the browser,
// payment confirmations come from the MOCK ZikiMall/CBZ adapter, and portal records are built by MOCK
// adapters (keyed by stand number) without touching the real sheets or Odoo.

import seed from "@/data/stands.seed.json";
import { config } from "@/config";
import { CAMPAIGN, paymentDueNowCents } from "@shared/domain/campaign.ts";
import { EMAIL_ATTACHMENTS, buildEmailProps, emailSubject, type EmailTemplateKey } from "@shared/domain/emails.ts";
import { DuplicateStandRecordError, createMockIntegrations, matchesPortalCredentials, prepopulatePortalRecords } from "@shared/domain/integrations.ts";
import { handlePaymentConfirmed, mockPaymentConfirmationAdapter } from "@shared/domain/payment-events.ts";
import { ZIKIMALL, zikimallAccountNumber } from "@shared/domain/payment-methods.ts";
import { normaliseOffer, validateOfferForm } from "@shared/domain/offer-form.ts";
import { validateContact } from "@shared/domain/contact.ts";
import type { Backend } from "./types";
import type { Lead, OutboxEmailRecord, Stand } from "./models";

const STORAGE_KEY = "lakecity-mock-v4";
const MOCK_STAFF = "dev-staff@lakecity.local";

interface MockState {
  stands: Stand[];
  leads: Lead[];
  outbox: OutboxEmailRecord[];
  /** Payment references already handled (idempotency), with their outcome. */
  payments: { reference: string; standNumber: string; status: string; at: string }[];
}

function freshState(): MockState {
  return {
    stands: seed.stands.map((s) => ({ standNumber: s.standNumber, sizeSqm: s.sizeSqm, phase: s.phase, landUse: s.landUse, status: "available", reservedLeadId: null })),
    leads: [],
    outbox: [],
    payments: [],
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
    return { zikimallUrl: ZIKIMALL.url, accountNumber: zikimallAccountNumber(lead), simulationAllowed: true, amountCents: paymentDueNowCents() };
  },

  async simulatePaymentConfirmed(leadId, reference) {
    await delay(600);
    const lead = requireLead(leadId);
    const surname = (lead.offer?.buyer.fullName ?? lead.contact.fullName).trim().split(/\s+/).at(-1);
    const event = mockPaymentConfirmationAdapter.simulate({ standNumber: lead.standNumber, payerSurname: surname, reference });
    const outcome = handlePaymentConfirmed(
      {
        isProcessed: (ref) => state.payments.some((p) => p.reference === ref),
        leads: () => state.leads,
        stand: (n) => state.stands.find((s) => s.standNumber === n) ?? null,
        // Single synchronous commit followed by one save(): all or nothing.
        commit: ({ reference: ref, outcome: o, stand, lead: updated, emailFor }) => {
          const next = structuredClone(state);
          next.payments.push({ reference: ref, standNumber: event.standNumber, status: o.status, at: now() });
          if (stand) next.stands = next.stands.map((s) => (s.standNumber === stand.standNumber ? stand : s));
          if (updated) next.leads = next.leads.map((l) => (l.id === updated.id ? updated : l));
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
      event,
    );
    save();
    if (outcome.status === "rejected" || outcome.status === "unmatched") throw new Error(outcome.reason);
    return outcome;
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

  async resetDemo() {
    state = freshState();
    save();
  },
};
