// Stand-sales orchestration shared by the edge functions and the local tests.
// No Deno imports. Customer emails are queued, never delivered from here.

import {
  blankAgreement,
  followUpReview,
  planAcknowledge,
  planActionRequired,
  planBuyerReturn,
  planCountersigned,
  planDispatch,
  planOriginalReceived,
  AgreementTransitionError,
  type AgreementState,
  type TransitionResult,
} from "./stand-sales-agreement.ts";
import { renderStandSalesEmail } from "./stand-sales-email.ts";
import { AGREEMENT_REVIEW_DOCUMENT_LABEL, AGREEMENT_REVIEW_DOCUMENT_URL, inPersonSigningLine, STAFF_AGREEMENT_NOTIFY_EMAIL } from "./stand-sales-office.ts";
import { DUE_NOW_CENTS, VAT_NOTE, bandOf, priceBands, standPriceCents } from "./stand-pricing.ts";
import {
  bracedApplicationId,
  buildLiteForm,
  isHold,
  isStaffAttention,
  newMerchantReference,
  newNonce,
  parseAuthoriseInfo,
  processIveriReturn,
  recheckAllAttempts,
  reviewBeforeStart,
  summariseChecks,
  type ApplyPaymentInput,
  type ApplyStatus,
  type AuthoriseInfo,
  type IveriConfig,
  type IveriReturnDeps,
  type IveriReturnOutcome,
  type PaymentAttempt,
} from "./iveri.ts";

export class SalesError extends Error {
  status: number;
  code: string;
  outcome?: IveriReturnOutcome;
  constructor(status: number, message: string, code: string, outcome?: IveriReturnOutcome) {
    super(message);
    this.status = status;
    this.code = code;
    this.outcome = outcome;
  }
}

export interface SalesApplication {
  id: string;
  standNumber: string;
  standInventoryId: string;
  fullName: string;
  email: string;
  phone: string;
  stage: "contact" | "offer" | "paid";
  offer: Record<string, unknown> | null;
  paidAt: string | null;
  paymentReference: string | null;
  paymentAmountCents: number | null;
  portalUserId: string | null;
  accessTokenHash: string;
  agreement?: AgreementState;
}

export interface StandListing {
  standNumber: string;
  phase: string | null;
  landUse: string | null;
  sizeSqm: number | null;
  priceCents: number | null;
  band: "A" | "B" | "C" | null;
  available: boolean;
  status: string | null;
}

export interface StaffQueueRow {
  reference: string;
  standNumber: string;
  status: string;
  cardStatus: number | null;
  createdAt: string;
  held: boolean;
  canDismiss: boolean;
}

export interface SalesStore {
  listStands(): Promise<StandListing[]>;
  standByNumber(standNumber: string): Promise<{ id: string; standNumber: string; available: boolean; sizeSqm: number | null } | null>;
  insertApplication(row: {
    standInventoryId: string;
    standNumber: string;
    fullName: string;
    email: string;
    phone: string;
    accessTokenHash: string;
  }): Promise<SalesApplication>;
  getApplication(id: string): Promise<SalesApplication | null>;
  saveOffer(id: string, offer: Record<string, unknown>, submittedAt: string): Promise<void>;
  listAttempts(applicationId: string): Promise<PaymentAttempt[]>;
  getAttempt(reference: string): Promise<PaymentAttempt | null>;
  holdReason(reference: string): Promise<string | null>;
  insertAttempt(row: { reference: string; applicationId: string; standNumber: string; nonce: string }): Promise<void>;
  markAttempt(reference: string, status: PaymentAttempt["status"], cardStatus: number | null): Promise<void>;
  applyPayment(input: ApplyPaymentInput): Promise<ApplyStatus>;
  queueEmail(applicationId: string, template: string, to: string, subject: string, html: string): Promise<void>;
  listStaffQueue(nowMs: number): Promise<StaffQueueRow[]>;
  dismissAttempt(reference: string, staffUserId: string): Promise<PaymentAttempt | null>;
  profileForStand(standNumber: string): Promise<{ id: string } | null>;
  createPortalUser(input: { email: string; password: string; fullName: string; phone: string; standNumber: string }): Promise<string>;
  setPortalUser(applicationId: string, userId: string): Promise<void>;
  isStaff(userId: string): Promise<boolean>;
  saveAgreement(input: {
    applicationId: string;
    standInventoryId: string;
    state: AgreementState;
    wizardStatus: string | null;
    requestedOn?: string | null;
    signedOn?: string | null;
  }): Promise<void>;
  listPaidApplications(): Promise<SalesApplication[]>;
  findPaidApplication(standNumber: string): Promise<SalesApplication | null>;
  profileByUserId(userId: string): Promise<{ id: string; standNumber: string | null } | null>;
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function requireBuyer(store: SalesStore, applicationId: string, accessToken: string): Promise<SalesApplication> {
  const app = await store.getApplication(applicationId);
  const hash = await sha256Hex(accessToken);
  if (!app || hash !== app.accessTokenHash) throw new SalesError(403, "This application link is not valid.", "forbidden");
  return app;
}

function depsFor(store: SalesStore, config: IveriConfig, authorise: (reference: string) => Promise<AuthoriseInfo>): IveriReturnDeps {
  return {
    getAttempt: (reference) => store.getAttempt(reference),
    holdReason: (reference) => store.holdReason(reference),
    authoriseInfo: authorise,
    applyPayment: (input) => store.applyPayment(input),
    markAttempt: (reference, status, cardStatus) => store.markAttempt(reference, status, cardStatus),
    emailFor: (attempt) => {
      return renderStandSalesEmail({
        template: "payment_thank_you",
        to: "",
        standNumber: attempt.standNumber,
        fullName: "",
        amountCents: DUE_NOW_CENTS,
        reference: attempt.reference,
      });
    },
    source: config.simulations ? "mock-iveri" : "iveri",
  };
}

async function authoriseFromGateway(config: IveriConfig, reference: string, fetchImpl: typeof fetch): Promise<AuthoriseInfo> {
  const res = await fetchImpl(config.authoriseInfoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      Lite_Merchant_ApplicationId: bracedApplicationId(config.applicationId),
      Lite_Merchant_Trace: reference,
    }).toString(),
  });
  if (!res.ok) throw new Error("AuthoriseInfo unavailable");
  return parseAuthoriseInfo(await res.text());
}

function withBuyerEmail(store: SalesStore, config: IveriConfig, authorise: (reference: string) => Promise<AuthoriseInfo>, app: SalesApplication): IveriReturnDeps {
  const deps = depsFor(store, config, authorise);
  deps.emailFor = (attempt) =>
    renderStandSalesEmail({
      template: "payment_thank_you",
      to: app.email,
      standNumber: attempt.standNumber,
      fullName: app.fullName,
      amountCents: DUE_NOW_CENTS,
      reference: attempt.reference,
    });
  return deps;
}

export async function startCardPayment(input: {
  store: SalesStore;
  config: IveriConfig;
  applicationId: string;
  accessToken: string;
  returnUrl: string;
  fetchImpl?: typeof fetch;
  authoriseInfo?: (reference: string) => Promise<AuthoriseInfo>;
}) {
  const app = await requireBuyer(input.store, input.applicationId, input.accessToken);
  if (app.stage === "paid") throw new SalesError(409, "This application has already been paid.", "already_paid");
  if (!app.offer || app.stage !== "offer") throw new SalesError(409, "Complete the offer form first.", "offer_required");
  const stand = await input.store.standByNumber(app.standNumber);
  if (!stand?.available) throw new SalesError(409, "Sorry, this stand is no longer available.", "stand_unavailable");
  const attempts = await input.store.listAttempts(app.id);
  const authorise = input.authoriseInfo ?? ((reference: string) => authoriseFromGateway(input.config, reference, input.fetchImpl ?? fetch));
  const deps = withBuyerEmail(input.store, input.config, authorise, app);
  const review = await reviewBeforeStart(deps, attempts);
  if (review.kind === "stop") {
    if (review.code === "already_approved") {
      return { alreadyApproved: true, outcome: review.outcome, amountCents: DUE_NOW_CENTS, simulationAllowed: input.config.simulations, vatNote: VAT_NOTE };
    }
    throw new SalesError(review.status, review.outcome.message, review.code, review.outcome);
  }
  const reference = newMerchantReference(app.standNumber);
  const nonce = newNonce();
  await input.store.insertAttempt({ reference, applicationId: app.id, standNumber: app.standNumber, nonce });
  const form = await buildLiteForm({
    config: input.config,
    amountCents: DUE_NOW_CENTS,
    email: app.email,
    reference,
    nonce,
    description: `LakeCity stand ${app.standNumber}: down payment and legal fee`,
    returnUrl: input.returnUrl,
  });
  return {
    reference,
    amountCents: DUE_NOW_CENTS,
    action: form.action,
    fields: form.fields,
    simulationAllowed: input.config.simulations,
    vatNote: VAT_NOTE,
  };
}

export async function checkCardPayments(input: {
  store: SalesStore;
  config: IveriConfig;
  applicationId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  authoriseInfo?: (reference: string) => Promise<AuthoriseInfo>;
}) {
  const app = await requireBuyer(input.store, input.applicationId, input.accessToken);
  const attempts = await input.store.listAttempts(app.id);
  if (attempts.length === 0) throw new SalesError(404, "There is no card payment to check yet.", "no_attempt");
  const authorise = input.authoriseInfo ?? ((reference: string) => authoriseFromGateway(input.config, reference, input.fetchImpl ?? fetch));
  const deps = withBuyerEmail(input.store, input.config, authorise, app);
  const outcomes = await recheckAllAttempts(deps, attempts);
  const summary = summariseChecks(outcomes);
  if (!summary) throw new SalesError(404, "There is no card payment to check yet.", "no_attempt");
  return { ...summary, stage: (await input.store.getApplication(app.id))?.stage ?? app.stage, checked: outcomes.length };
}

export async function handleGatewayReturn(input: {
  store: SalesStore;
  config: IveriConfig;
  reference: string;
  kind?: string;
  fetchImpl?: typeof fetch;
  authoriseInfo?: (reference: string) => Promise<AuthoriseInfo>;
}) {
  const attempt = await input.store.getAttempt(input.reference);
  if (!attempt) return null;
  const app = await input.store.getApplication(attempt.applicationId);
  if (!app) return null;
  const authorise = input.authoriseInfo ?? ((reference: string) => authoriseFromGateway(input.config, reference, input.fetchImpl ?? fetch));
  const deps = withBuyerEmail(input.store, input.config, authorise, app);
  return processIveriReturn(deps, { reference: input.reference, kind: input.kind });
}

export async function sweepOpenAttempts(input: {
  store: SalesStore;
  config: IveriConfig;
  fetchImpl?: typeof fetch;
  listOpen: () => Promise<PaymentAttempt[]>;
}) {
  const open = await input.listOpen();
  let checked = 0;
  for (const attempt of open) {
    const app = await input.store.getApplication(attempt.applicationId);
    if (!app) continue;
    const deps = withBuyerEmail(
      input.store,
      input.config,
      (reference) => authoriseFromGateway(input.config, reference, input.fetchImpl ?? fetch),
      app,
    );
    await processIveriReturn(deps, { reference: attempt.reference });
    checked += 1;
  }
  return { checked };
}

export function validateContact(input: { fullName: string; email: string; phone: string }) {
  const errors: Record<string, string> = {};
  if (input.fullName.trim().length < 3) errors.fullName = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "Enter a valid email.";
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 9) errors.phone = "Enter a phone number we can use for verification.";
  return errors;
}

export function validateOffer(input: Record<string, unknown>, fullName: string) {
  const errors: Record<string, string> = {};
  const idNumber = String(input.idNumber ?? "").trim();
  const address = String(input.address ?? "").trim();
  const nextOfKin = String(input.nextOfKin ?? "").trim();
  const signature = String(input.signature ?? "").trim();
  if (idNumber.length < 5) errors.idNumber = "Enter the ID or passport number.";
  if (address.length < 5) errors.address = "Enter the purchaser address.";
  if (nextOfKin.length < 3) errors.nextOfKin = "Enter a next of kin.";
  if (input.accepted !== true) errors.accepted = "Please accept the conditions to continue.";
  if (signature.toLowerCase() !== fullName.trim().toLowerCase()) errors.signature = "Type your full name as your signature.";
  return errors;
}

export async function createApplication(store: SalesStore, input: { standNumber: string; fullName: string; email: string; phone: string }) {
  const errors = validateContact(input);
  if (Object.keys(errors).length) throw new SalesError(400, Object.values(errors)[0], "invalid_contact");
  const stand = await store.standByNumber(input.standNumber.trim());
  if (!stand) throw new SalesError(404, "That stand is not in this campaign.", "stand_missing");
  if (!stand.available) throw new SalesError(409, "Sorry, this stand is no longer available.", "stand_unavailable");
  const accessToken = newAccessToken();
  const app = await store.insertApplication({
    standInventoryId: stand.id,
    standNumber: stand.standNumber,
    fullName: input.fullName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    accessTokenHash: await sha256Hex(accessToken),
  });
  return { applicationId: app.id, accessToken, standNumber: app.standNumber };
}

export async function submitOffer(store: SalesStore, input: { applicationId: string; accessToken: string; offer: Record<string, unknown> }) {
  const app = await requireBuyer(store, input.applicationId, input.accessToken);
  if (app.stage === "paid") throw new SalesError(409, "The offer can no longer be changed.", "already_paid");
  const errors = validateOffer(input.offer, app.fullName);
  if (Object.keys(errors).length) throw new SalesError(400, Object.values(errors)[0], "invalid_offer");
  const submittedAt = new Date().toISOString();
  const offer = {
    idNumber: String(input.offer.idNumber).trim(),
    address: String(input.offer.address).trim(),
    nextOfKin: String(input.offer.nextOfKin).trim(),
    signature: String(input.offer.signature).trim(),
    accepted: true,
    submittedAt,
  };
  await store.saveOffer(app.id, offer, submittedAt);
  const email = renderStandSalesEmail({ template: "offer_completed", to: app.email, standNumber: app.standNumber, fullName: app.fullName });
  await store.queueEmail(app.id, email.template, email.to, email.subject, email.html);
  return { ok: true };
}

export async function createPortalLogin(store: SalesStore, input: { applicationId: string; accessToken: string; standNumber: string; password: string }) {
  const app = await requireBuyer(store, input.applicationId, input.accessToken);
  if (app.stage !== "paid") throw new SalesError(409, "Your payment has not been confirmed yet.", "not_paid");
  if (input.standNumber.trim() !== app.standNumber) throw new SalesError(403, "The stand number does not match this application.", "stand_mismatch");
  if (input.password.length < 8) throw new SalesError(400, "Use a password of at least 8 characters.", "weak_password");
  if (app.portalUserId) return { ok: true, already: true };
  const existing = await store.profileForStand(app.standNumber);
  if (existing) throw new SalesError(409, "This stand already has a portal login. Sign in with your stand number and password.", "login_exists");
  const userId = await store.createPortalUser({
    email: app.email,
    password: input.password,
    fullName: app.fullName,
    phone: app.phone,
    standNumber: app.standNumber,
  });
  await store.setPortalUser(app.id, userId);
  const email = renderStandSalesEmail({ template: "portal_ready", to: app.email, standNumber: app.standNumber, fullName: app.fullName });
  await store.queueEmail(app.id, email.template, email.to, email.subject, email.html);
  return { ok: true, already: false };
}

export async function recheckAttempt(store: SalesStore, config: IveriConfig, attempt: PaymentAttempt) {
  const app = await store.getApplication(attempt.applicationId);
  if (!app) throw new SalesError(404, "That payment attempt cannot be dismissed.", "not_found");
  const deps = withBuyerEmail(store, config, (reference) => authoriseFromGateway(config, reference, fetch), app);
  return processIveriReturn(deps, { reference: attempt.reference });
}

export async function dismissForStaff(
  store: SalesStore,
  staffUserId: string,
  reference: string,
  recheck: (attempt: PaymentAttempt) => Promise<IveriReturnOutcome>,
) {
  if (!(await store.isStaff(staffUserId))) throw new SalesError(403, "Staff access is required.", "not_staff");
  const current = await store.getAttempt(reference);
  if (!current || current.status === "approved" || current.dismissedAt) {
    throw new SalesError(404, "That payment attempt cannot be dismissed.", "not_found");
  }
  if (!isHold(current)) {
    const outcome = await recheck(current);
    if (outcome.cardStatus === 0 || outcome.result === "approved" || outcome.result === "second_charge") {
      throw new SalesError(409, "The bank approved this attempt. It is now held for Accounts. Dismiss it again only if you mean to release that hold.", "payment_held");
    }
    if (outcome.result === "pending") {
      throw new SalesError(409, "We couldn't confirm this attempt with the bank, so it was left in place.", "recheck_unavailable");
    }
  }
  const attempt = await store.dismissAttempt(reference, staffUserId);
  if (!attempt) throw new SalesError(404, "That payment attempt cannot be dismissed.", "not_found");
  return { ok: true, reference: attempt.reference, status: attempt.status };
}

export async function queueForStaff(store: SalesStore, staffUserId: string) {
  if (!(await store.isStaff(staffUserId))) throw new SalesError(403, "Staff access is required.", "not_staff");
  return store.listStaffQueue(Date.now());
}

export function agreementOf(app: SalesApplication): AgreementState {
  return app.agreement ?? blankAgreement();
}

export function toBuyerPayload(app: SalesApplication) {
  const agreement = agreementOf(app);
  return {
    id: app.id,
    standNumber: app.standNumber,
    fullName: app.fullName,
    email: app.email,
    phone: app.phone,
    stage: app.stage,
    offer: app.offer,
    paidAt: app.paidAt,
    paymentReference: app.paymentReference,
    paymentAmountCents: app.paymentAmountCents,
    portalReady: Boolean(app.portalUserId),
    agreementStatus: agreement.status,
    executionMethod: agreement.executionMethod,
    region: agreement.region,
    acknowledgedAt: agreement.acknowledgedAt,
    dispatchedAt: agreement.dispatchedAt,
    dispatchTracking: agreement.dispatchTracking,
    returnSubmittedAt: agreement.returnSubmittedAt,
    returnTracking: agreement.returnTracking,
    returnCourier: agreement.returnCourier,
    originalReceivedAt: agreement.originalReceivedAt,
    countersignedAt: agreement.countersignedAt,
    actionMessage: agreement.status === "action_required" ? agreement.actionMessage : null,
    documentUrl: AGREEMENT_REVIEW_DOCUMENT_URL,
    documentLabel: AGREEMENT_REVIEW_DOCUMENT_LABEL,
    inPersonLine: inPersonSigningLine(),
  };
}

export async function requireAgreementBuyer(store: SalesStore, input: {
  applicationId?: string;
  accessToken?: string;
  standNumber?: string;
  portalUser?: { id: string; standNumber: string | null } | null;
}): Promise<SalesApplication> {
  if (input.accessToken) {
    const app = await requireBuyer(store, String(input.applicationId ?? ""), input.accessToken);
    if (input.standNumber && input.standNumber !== app.standNumber) {
      throw new SalesError(403, "This application link is not valid.", "forbidden");
    }
    return app;
  }
  const standNumber = String(input.standNumber ?? "");
  const portal = input.portalUser;
  if (!portal?.id || !portal.standNumber || portal.standNumber !== standNumber) {
    throw new SalesError(403, "This application link is not valid.", "forbidden");
  }
  const app = await store.findPaidApplication(standNumber);
  if (!app || app.stage !== "paid") throw new SalesError(403, "This application link is not valid.", "forbidden");
  if (app.portalUserId && app.portalUserId !== portal.id) throw new SalesError(403, "This application link is not valid.", "forbidden");
  return app;
}

function requirePaidStage(app: SalesApplication) {
  if (app.stage !== "paid") throw new SalesError(409, "Your payment has not been confirmed yet.", "not_paid");
}

function unwrapAgreement<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof AgreementTransitionError) throw new SalesError(error.status, error.message, error.code);
    throw error;
  }
}

async function applyAgreement(store: SalesStore, app: SalesApplication, result: TransitionResult) {
  await store.saveAgreement({
    applicationId: app.id,
    standInventoryId: app.standInventoryId,
    state: result.state,
    wizardStatus: result.wizardStatus,
    requestedOn: result.requestedOn ?? null,
    signedOn: result.signedOn ?? null,
  });
  for (const planned of result.emails) {
    const to = planned.audience === "staff" ? STAFF_AGREEMENT_NOTIFY_EMAIL : app.email;
    const tracking = planned.template === "agreement_sent_wet_signature"
      ? result.state.dispatchTracking ?? ""
      : result.state.returnTracking ?? "";
    const email = renderStandSalesEmail({
      template: planned.template,
      to,
      standNumber: app.standNumber,
      fullName: app.fullName,
      tracking,
      courierName: result.state.returnCourier ?? "",
      actionMessage: result.state.actionMessage ?? "",
      executionMethod: result.state.executionMethod,
    });
    await store.queueEmail(app.id, email.template, email.to, email.subject, email.html);
  }
  return { ok: true as const, agreementStatus: result.state.status };
}

export async function acknowledgeAndRequestAgreement(
  store: SalesStore,
  app: SalesApplication,
  input: Record<string, unknown>,
  options: { docusignEnabled: boolean; now?: string },
) {
  requirePaidStage(app);
  const now = options.now ?? new Date().toISOString();
  const result = unwrapAgreement(() => planAcknowledge(agreementOf(app), input, now, options.docusignEnabled));
  return applyAgreement(store, app, result);
}

export async function submitBuyerReturn(store: SalesStore, app: SalesApplication, input: Record<string, unknown>, now = new Date().toISOString()) {
  requirePaidStage(app);
  const result = unwrapAgreement(() => planBuyerReturn(agreementOf(app), input, now));
  return applyAgreement(store, app, result);
}

async function paidForStaff(store: SalesStore, staffUserId: string, applicationId: string) {
  if (!(await store.isStaff(staffUserId))) throw new SalesError(403, "Staff access is required.", "not_staff");
  const app = await store.getApplication(applicationId);
  if (!app || app.stage !== "paid") throw new SalesError(404, "That paid application was not found.", "not_found");
  return app;
}

export async function agreementsForStaff(store: SalesStore, staffUserId: string, nowMs = Date.now()) {
  if (!(await store.isStaff(staffUserId))) throw new SalesError(403, "Staff access is required.", "not_staff");
  const apps = await store.listPaidApplications();
  return apps.map((app) => {
    const state = agreementOf(app);
    return {
      applicationId: app.id,
      standNumber: app.standNumber,
      fullName: app.fullName,
      email: app.email,
      status: state.status,
      executionMethod: state.executionMethod,
      region: state.region,
      dispatchedAt: state.dispatchedAt,
      dispatchTracking: state.dispatchTracking,
      returnTracking: state.returnTracking,
      returnCourier: state.returnCourier,
      actionMessage: state.actionMessage,
      followUp: followUpReview(state, nowMs),
      witnesses: state.witnesses,
      domiciliumAddress: state.domicilium?.address ?? null,
    };
  });
}

export async function staffMarkDispatched(store: SalesStore, staffUserId: string, applicationId: string, tracking: string, now = new Date().toISOString()) {
  const app = await paidForStaff(store, staffUserId, applicationId);
  const result = unwrapAgreement(() => planDispatch(agreementOf(app), tracking, now));
  return applyAgreement(store, app, result);
}

export async function staffMarkOriginalReceived(store: SalesStore, staffUserId: string, applicationId: string, now = new Date().toISOString()) {
  const app = await paidForStaff(store, staffUserId, applicationId);
  const result = unwrapAgreement(() => planOriginalReceived(agreementOf(app), now));
  return applyAgreement(store, app, result);
}

export async function staffMarkCountersigned(store: SalesStore, staffUserId: string, applicationId: string, now = new Date().toISOString()) {
  const app = await paidForStaff(store, staffUserId, applicationId);
  const result = unwrapAgreement(() => planCountersigned(agreementOf(app), now));
  return applyAgreement(store, app, result);
}

export async function staffMarkActionRequired(store: SalesStore, staffUserId: string, applicationId: string, message: string, now = new Date().toISOString()) {
  const app = await paidForStaff(store, staffUserId, applicationId);
  const result = unwrapAgreement(() => planActionRequired(agreementOf(app), message, now));
  return applyAgreement(store, app, result);
}

export function decorateStands(rows: Array<{ standNumber: string; phase: string | null; landUse: string | null; sizeSqm: number | null; status: string | null; wizardSaleStatus: string | null; paid: boolean }>): StandListing[] {
  const prices = rows.filter((r) => r.sizeSqm && r.sizeSqm > 0).map((r) => standPriceCents(r.sizeSqm!));
  const bands = priceBands(prices);
  return rows.map((row) => {
    const priceCents = row.sizeSqm && row.sizeSqm > 0 ? standPriceCents(row.sizeSqm) : null;
    const official = (row.status ?? "").trim().toLowerCase();
    const marketable = official === "available";
    const wizardFree = !row.wizardSaleStatus || row.wizardSaleStatus === "available";
    return {
      standNumber: row.standNumber,
      phase: row.phase,
      landUse: row.landUse,
      sizeSqm: row.sizeSqm,
      priceCents,
      band: priceCents !== null && bands ? bandOf(priceCents, bands) : null,
      available: marketable && wizardFree && !row.paid,
      status: row.status,
    };
  });
}

export function staffRowFromAttempt(attempt: PaymentAttempt, nowMs: number): StaffQueueRow | null {
  if (!isStaffAttention(attempt, nowMs)) return null;
  const held = attempt.status === "error" && attempt.cardStatus === 0 && !attempt.dismissedAt;
  return {
    reference: attempt.reference,
    standNumber: attempt.standNumber,
    status: attempt.status,
    cardStatus: attempt.cardStatus,
    createdAt: attempt.createdAt,
    held,
    canDismiss: attempt.status !== "approved",
  };
}

export type { IveriConfig, IveriReturnOutcome, PaymentAttempt };
