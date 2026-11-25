// Local mock backend so the whole flow runs without Supabase.
// Non-image data is kept in localStorage so the demo survives reloads. ID images are personal data
// and are held in memory only (lost on reload); nothing here is sent anywhere.

import seed from "@/data/stands.seed.json";
import { config } from "@/config";
import { CAMPAIGN } from "@shared/domain/campaign.ts";
import { EMAIL_ATTACHMENTS, EMAIL_SUBJECTS, buildEmailProps, type EmailTemplateKey } from "@shared/domain/emails.ts";
import { validateIdentity } from "@shared/domain/id-validation.ts";
import { validateOfferForm } from "@shared/domain/offer-form.ts";
import { checkIdUploadMeta } from "@shared/domain/uploads.ts";
import type { Backend, IntakeSubmission, PersonSubmission } from "./types";
import type { IdReviewLogEntry, Lead, OutboxEmailRecord, Stand } from "./models";

const STORAGE_KEY = "lakecity-mock-v1";
const MOCK_STAFF = "dev-staff@lakecity.local";

interface MockState {
  stands: Stand[];
  leads: Lead[];
  reviewLog: IdReviewLogEntry[];
  outbox: OutboxEmailRecord[];
}

const idImages = new Map<string, Blob>();
const objectUrls = new Map<string, string>();

function freshState(): MockState {
  return {
    stands: seed.stands.map((s) => ({
      standNumber: s.standNumber,
      sizeSqm: s.sizeSqm,
      priceUsd: s.priceUsd,
      depositUsd: s.depositUsd,
      status: "available",
      reservedLeadId: null,
    })),
    leads: [],
    reviewLog: [],
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

function storeImage(leadId: string, who: string, side: "front" | "back", blob: Blob | null): string | null {
  if (!blob) return null;
  const err = checkIdUploadMeta(blob);
  if (err) throw new Error(err);
  const path = `mock://${leadId}/${who}-${side}`;
  idImages.set(path, blob);
  return path;
}

function validatePerson(p: PersonSubmission, label: string) {
  const v = validateIdentity({ idType: p.idType, issuingCountry: p.idIssuingCountry, idNumber: p.idNumber, expiryDate: p.idExpiry });
  if (!v.ok) throw new Error(`${label}: ${Object.values(v.errors)[0]}`);
  if (!p.fullName.trim() || !p.email.trim() || !p.phone.trim() || !p.dateOfBirth) {
    throw new Error(`${label}: name, date of birth, email and phone are required.`);
  }
  return v.normalized;
}

/** Dev outbox: records the email and logs metadata only (never the address, ID data or body). */
function queueEmail(template: EmailTemplateKey, lead: Lead) {
  const stand = requireStand(lead.standNumber);
  state.outbox.push({
    id: uid(),
    leadId: lead.id,
    template,
    to: lead.buyer.email,
    subject: EMAIL_SUBJECTS[template],
    props: buildEmailProps(lead, stand, config.portalUrl),
    attachmentNames: EMAIL_ATTACHMENTS[template] ?? [],
    status: "queued_dev_only",
    createdAt: now(),
  });
  console.info(`[email:dev-outbox] queued "${template}" for lead ${lead.id.slice(0, 8)} (not sent)`);
}

export const mockBackend: Backend = {
  mode: "mock",

  async listStands() {
    await delay(150);
    return structuredClone(state.stands);
  },

  async submitIntake(input: IntakeSubmission) {
    await delay(500);
    const stand = requireStand(input.standNumber);
    if (stand.status !== "available") throw new Error("Sorry, this stand is no longer available.");
    const buyerId = validatePerson(input.buyer, "Buyer");
    const id = uid();
    const lead: Lead = {
      id,
      createdAt: now(),
      stage: "form_filled",
      idReviewStatus: "id_pending_review",
      idReviewReason: null,
      idReviewedBy: null,
      idReviewedAt: null,
      buyer: {
        fullName: input.buyer.fullName.trim(),
        dateOfBirth: input.buyer.dateOfBirth,
        email: input.buyer.email.trim(),
        phone: input.buyer.phone.trim(),
        physicalAddress: input.buyer.physicalAddress.trim(),
        postalAddress: input.buyer.postalAddress.trim(),
        country: input.buyer.country,
        idType: input.buyer.idType,
        idIssuingCountry: input.buyer.idIssuingCountry,
        idNumber: buyerId,
        idExpiry: input.buyer.idExpiry || null,
        idFrontPath: storeImage(id, "buyer", "front", input.buyer.idFront),
        idBackPath: storeImage(id, "buyer", "back", input.buyer.idBack),
      },
      coOwners: input.coOwners.map((c, i) => ({
        id: uid(),
        position: i + 1,
        fullName: c.fullName.trim(),
        dateOfBirth: c.dateOfBirth,
        email: c.email.trim(),
        phone: c.phone.trim(),
        idType: c.idType,
        idIssuingCountry: c.idIssuingCountry,
        idNumber: validatePerson(c, `Co-owner ${i + 1}`),
        idExpiry: c.idExpiry || null,
        idFrontPath: storeImage(id, `coowner${i + 1}`, "front", c.idFront),
        idBackPath: storeImage(id, `coowner${i + 1}`, "back", c.idBack),
      })),
      standNumber: input.standNumber,
      offer: null,
      officialUse: null,
      scheduleEmailedAt: null,
      scheduleAcceptedAt: null,
      paidAt: null,
      paymentReference: null,
      collectionAccountId: null,
      collectionAccountCreatedAt: null,
      portalStatus: "not_created",
      portalCreatedAt: null,
      portalActivatedAt: null,
      envelopeId: null,
      signedAt: null,
    };
    state.leads.push(lead);
    queueEmail("intake_submitted", lead);
    save();
    return { leadId: id };
  },

  async getLead(leadId) {
    await delay(100);
    const lead = state.leads.find((l) => l.id === leadId);
    return lead ? structuredClone(lead) : null;
  },

  async submitOffer(leadId, offer) {
    await delay(400);
    const lead = requireLead(leadId);
    if (lead.idReviewStatus !== "approved") throw new Error("Your ID has not been approved yet.");
    const errors = validateOfferForm(offer);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    lead.offer = { ...offer, termMonths: CAMPAIGN.termMonths, submittedAt: now() };
    queueEmail("offer_completed", lead);
    queueEmail("schedule_generated", lead);
    lead.scheduleEmailedAt = now();
    save();
  },

  async acceptSchedule(leadId) {
    await delay(200);
    const lead = requireLead(leadId);
    if (!lead.offer) throw new Error("Complete the offer form first.");
    lead.scheduleAcceptedAt ??= now();
    save();
  },

  async startPayment(leadId) {
    await delay(200);
    const lead = requireLead(leadId);
    if (lead.idReviewStatus !== "approved") throw new Error("Your ID has not been approved yet.");
    const props = buildEmailProps(lead, requireStand(lead.standNumber), config.portalUrl);
    return { redirectUrl: null, simulationAllowed: true, amountCents: props.depositCents / (lead.offer?.depositInstalments ?? 1) };
  },

  async simulatePaymentConfirmed(leadId) {
    await delay(600);
    const lead = requireLead(leadId);
    if (lead.stage !== "form_filled") return;
    if (lead.idReviewStatus !== "approved" || !lead.scheduleAcceptedAt) throw new Error("Previous steps are not complete.");
    const stand = requireStand(lead.standNumber);
    if (stand.status !== "available") throw new Error("Stand no longer available.");
    stand.status = "paid";
    stand.reservedLeadId = lead.id;
    lead.stage = "paid";
    lead.paidAt = now();
    lead.paymentReference = `ZM-SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    queueEmail("payment_received", lead);
    // Collection Schedule account, then the portal account pre-linked to it (activation comes later).
    lead.collectionAccountId = `LC-CS-${lead.standNumber}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    lead.collectionAccountCreatedAt = now();
    lead.portalStatus = "created";
    lead.portalCreatedAt = now();
    save();
  },

  async getSigningSession(leadId) {
    await delay(300);
    const lead = requireLead(leadId);
    if (lead.stage === "signed") return { status: "signed" };
    return {
      status: "not_configured",
      message: "DocuSign is not configured in local mock mode. Connect Supabase and add DocuSign demo keys to sign for real.",
      simulationAllowed: true,
    };
  },

  async simulateSigningCompleted(leadId) {
    await delay(600);
    const lead = requireLead(leadId);
    if (lead.stage !== "paid") throw new Error("Payment must be confirmed before signing.");
    const stand = requireStand(lead.standNumber);
    stand.status = "signed";
    lead.stage = "signed";
    lead.signedAt = now();
    lead.envelopeId = `SIMULATED-${lead.id.slice(0, 8)}`;
    queueEmail("agreement_signed", lead);
    queueEmail("portal_created", lead);
    save();
  },

  async activatePortal(leadId, method) {
    await delay(500);
    const lead = requireLead(leadId);
    if (lead.portalStatus === "not_created") throw new Error("Your portal account has not been created yet.");
    if (lead.stage !== "signed") throw new Error("Sign your agreement first.");
    if (method.kind === "password" && method.password.length < 10) throw new Error("Use at least 10 characters.");
    // The password is never stored by the mock.
    if (lead.portalStatus !== "activated") {
      lead.portalStatus = "activated";
      lead.portalActivatedAt = now();
      queueEmail("celebration", lead);
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

  async listReviewLog(leadId) {
    return state.reviewLog.filter((r) => r.leadId === leadId);
  },

  async getIdDocumentUrl(path) {
    const blob = idImages.get(path);
    if (!blob) return null;
    let url = objectUrls.get(path);
    if (!url) {
      url = URL.createObjectURL(blob);
      objectUrls.set(path, url);
    }
    return url;
  },

  async reviewId(leadId, decision, reason) {
    await delay(300);
    const lead = requireLead(leadId);
    if (lead.stage !== "form_filled") throw new Error("Lead already paid; ID review is locked.");
    if (decision === "rejected" && !reason.trim()) throw new Error("A reason is required when rejecting.");
    lead.idReviewStatus = decision;
    lead.idReviewReason = reason.trim() || null;
    lead.idReviewedBy = MOCK_STAFF;
    lead.idReviewedAt = now();
    state.reviewLog.push({ id: uid(), leadId, decision, reason: reason.trim() || null, reviewer: MOCK_STAFF, createdAt: now() });
    save();
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
    idImages.clear();
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.clear();
    save();
  },
};
