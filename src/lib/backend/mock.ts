// Local mock backend so the whole flow runs without Supabase. State is kept in localStorage so the
// demo survives reloads. Nothing here is sent anywhere: no money moves, no emails leave the browser,
// and the portal records are built by MOCK adapters without touching Sheets or Odoo.

import seed from "@/data/stands.seed.json";
import { config } from "@/config";
import { CAMPAIGN, paymentDueNowCents } from "@shared/domain/campaign.ts";
import { EMAIL_ATTACHMENTS, buildEmailProps, emailSubject, type EmailTemplateKey } from "@shared/domain/emails.ts";
import { matchesPortalCredentials, prepopulatePortalRecords } from "@shared/domain/integrations.ts";
import { normaliseOffer, validateOfferForm } from "@shared/domain/offer-form.ts";
import { validateContact } from "@shared/domain/contact.ts";
import type { Backend } from "./types";
import type { Lead, OutboxEmailRecord, Stand } from "./models";

const STORAGE_KEY = "lakecity-mock-v2";
const MOCK_STAFF = "dev-staff@lakecity.local";

interface MockState {
  stands: Stand[];
  leads: Lead[];
  outbox: OutboxEmailRecord[];
}

function freshState(): MockState {
  return {
    stands: seed.stands.map((s) => ({ standNumber: s.standNumber, sizeSqm: s.sizeSqm, status: "available", reservedLeadId: null })),
    leads: [],
    outbox: [],
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
    return { redirectUrl: null, simulationAllowed: true, amountCents: paymentDueNowCents() };
  },

  async simulatePaymentConfirmed(leadId) {
    await delay(600);
    const lead = requireLead(leadId);
    if (lead.stage !== "form_filled") return;
    if (!lead.offer) throw new Error("Complete the offer form first.");
    const stand = requireStand(lead.standNumber);
    if (stand.status !== "available") throw new Error("Stand no longer available.");
    stand.status = "paid";
    stand.reservedLeadId = lead.id;
    lead.stage = "paid";
    lead.paidAt = now();
    lead.paymentAmountCents = paymentDueNowCents();
    lead.paymentReference = `ZM-SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    queueEmail("payment_thank_you", lead);
    save();
  },

  async enrolPortal(leadId, input) {
    await delay(500);
    const lead = requireLead(leadId);
    if (lead.stage === "form_filled") throw new Error("Your payment has not been confirmed yet.");
    if (!matchesPortalCredentials(lead, input.standNumber, input.phone)) {
      throw new Error("The stand number and phone number don't match this application.");
    }
    if (lead.portalStatus !== "prepopulated") {
      lead.portalRecords = prepopulatePortalRecords({ lead, stand: requireStand(lead.standNumber), now: new Date() });
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
