// iVeri Lite, Full Redirect. TEST environment only.
// Card details never touch this app. A payment is confirmed only when AuthoriseInfo
// reports card status 0, amount 225000 cents USD, and the same MerchantReference and LC_Nonce
// we stored for that attempt. App ID and shared secret come from env; never log them.

import { DUE_NOW_CENTS, formatUsd } from "./stand-pricing.ts";

export const IVERI_TEST_GATEWAY_URL = "https://portal.host.iveri.com/Lite/Authorise.aspx";
export const IVERI_TEST_AUTHORISE_INFO_URL = "https://portal.host.iveri.com/Lite/AuthoriseInfo.aspx";
const TOKEN_RESOURCE = "/Lite/Authorise.aspx";
const ALLOWED_HOSTS = new Set(["portal.host.iveri.com"]);

export interface IveriConfig {
  environment: "test";
  applicationId: string;
  sharedSecret: string | null;
  gatewayUrl: string;
  authoriseInfoUrl: string;
  simulations: boolean;
}

export function iveriConfigFromEnv(get: (key: string) => string | undefined): IveriConfig | { disabled: string } {
  const environment = (get("IVERI_ENVIRONMENT") ?? "").trim().toLowerCase();
  if (environment !== "test") {
    return {
      disabled: environment
        ? "Only the iVeri TEST environment is allowed."
        : "iVeri is off. Set IVERI_ENVIRONMENT=test to use the TEST gateway.",
    };
  }
  const applicationId = (get("IVERI_APPLICATION_ID") ?? "").trim();
  if (!applicationId) return { disabled: "IVERI_APPLICATION_ID is not set." };
  const allowDev = (get("ALLOW_DEV_SIMULATIONS") ?? "").trim() === "true";
  const gatewayUrl = (get("IVERI_GATEWAY_URL") ?? "").trim() || IVERI_TEST_GATEWAY_URL;
  const authoriseInfoUrl = (get("IVERI_AUTHORISE_INFO_URL") ?? "").trim() || IVERI_TEST_AUTHORISE_INFO_URL;
  const gatewayProblem = gatewayUrlProblem(gatewayUrl, allowDev);
  if (gatewayProblem) return { disabled: gatewayProblem };
  const infoProblem = gatewayUrlProblem(authoriseInfoUrl, allowDev);
  if (infoProblem) return { disabled: infoProblem };
  return {
    environment: "test",
    applicationId,
    sharedSecret: (get("IVERI_SHARED_SECRET") ?? "").trim() || null,
    gatewayUrl,
    authoriseInfoUrl,
    simulations: allowDev,
  };
}

export function gatewayUrlProblem(raw: string, allowDev: boolean): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "iVeri gateway URL is not valid.";
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === "https:" && ALLOWED_HOSTS.has(host)) return null;
  const devHost = host === "127.0.0.1" || host === "localhost";
  if (allowDev && devHost && (url.protocol === "http:" || url.protocol === "https:")) return null;
  return "iVeri gateway host is not on the allowed list.";
}

export function bracedApplicationId(raw: string): string {
  return `{${raw.trim().replace(/^\{|\}$/g, "").toUpperCase()}}`;
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newMerchantReference(
  standNumber: string,
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const stand = standNumber.trim().replace(/[^0-9A-Za-z]/g, "").slice(0, 8);
  if (!stand) throw new Error("Stand number is required for the merchant reference.");
  const suffix = [...random(8)].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
  return `LC${stand}-${suffix}`.slice(0, 20);
}

export function newNonce(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return [...random(16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function standFromReference(reference: string): string | null {
  return /^LC([0-9A-Za-z]{1,8})-[A-Z0-9]+$/.exec(reference.trim())?.[1] ?? null;
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function liteTransactionToken(input: {
  secret: string;
  applicationIdBraced: string;
  amountCents: string;
  email: string;
  nowSeconds: number;
}) {
  const time = String(input.nowSeconds);
  return `${time}:${await sha256Hex(input.secret + time + TOKEN_RESOURCE + input.applicationIdBraced + input.amountCents + input.email)}`;
}

export interface LiteForm {
  action: string;
  fields: Record<string, string>;
}

export async function buildLiteForm(input: {
  config: IveriConfig;
  amountCents: number;
  email: string;
  reference: string;
  nonce: string;
  description: string;
  returnUrl: string;
  now?: Date;
}): Promise<LiteForm> {
  if (input.amountCents !== DUE_NOW_CENTS) throw new Error("Invalid payment amount.");
  const amount = String(input.amountCents);
  const appId = bracedApplicationId(input.config.applicationId);
  const email = input.email.trim().slice(0, 40);
  if (!email) throw new Error("Email is required for card payments.");
  const reference = input.reference.trim().slice(0, 20);
  const nonce = input.nonce.trim();
  if (!nonce) throw new Error("LC_Nonce is required.");
  const back = (kind: "success" | "fail" | "trylater" | "error") => {
    const u = new URL(input.returnUrl);
    u.searchParams.set("trace", reference);
    u.searchParams.set("kind", kind);
    return u.toString();
  };
  const fields: Record<string, string> = {
    Lite_Merchant_ApplicationId: appId,
    Lite_Order_Amount: amount,
    Lite_Currency_AlphaCode: "USD",
    Lite_Website_Successful_Url: back("success"),
    Lite_Website_Fail_Url: back("fail"),
    Lite_Website_TryLater_Url: back("trylater"),
    Lite_Website_Error_Url: back("error"),
    Lite_Order_LineItems_Product_1: input.description.slice(0, 255),
    Lite_Order_LineItems_Quantity_1: "1",
    Lite_Order_LineItems_Amount_1: amount,
    Lite_ConsumerOrderID_PreFix: "LC",
    Lite_Merchant_Trace: reference,
    Ecom_BillTo_Online_Email: email,
    Ecom_Payment_Card_Protocols: "IVERI",
    Ecom_ConsumerOrderID: reference,
    Ecom_TransactionComplete: "False",
    MerchantReference: reference,
    LC_Nonce: nonce,
    Lite_Version: "4.0",
  };
  if (input.config.sharedSecret) {
    fields.Lite_Transaction_Token = await liteTransactionToken({
      secret: input.config.sharedSecret,
      applicationIdBraced: appId,
      amountCents: amount,
      email,
      nowSeconds: Math.floor((input.now ?? new Date()).getTime() / 1000),
    });
  }
  return { action: input.config.gatewayUrl, fields };
}

export interface AuthoriseInfo {
  cardStatus: number | null;
  description: string;
  trace: string | null;
  amountCents: number | null;
  currency: string | null;
  merchantReference: string | null;
  nonce: string | null;
}

function field(text: string, name: string): string | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`name=["']${n}["'][^>]*value=["']([^"']*)["']`, "i"),
    new RegExp(`value=["']([^"']*)["'][^>]*name=["']${n}["']`, "i"),
    new RegExp(`<${n}>([^<]*)</${n}>`, "i"),
    new RegExp(`(?:^|[&?\\s])${n}=([^&\\r\\n<]*)`, "i"),
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) {
      try {
        return decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
      } catch {
        return m[1].trim();
      }
    }
  }
  return null;
}

/** Parses an AuthoriseInfo response. Card numbers are not returned. */
export function parseAuthoriseInfo(text: string): AuthoriseInfo {
  const status = field(text, "Lite_Payment_Card_Status");
  const amount = field(text, "Lite_Order_Amount");
  return {
    cardStatus: status && /^-?\d+$/.test(status) ? Number(status) : null,
    description: (field(text, "Lite_Result_Description") ?? "").slice(0, 200),
    trace: field(text, "Lite_Merchant_Trace") || null,
    amountCents: amount && /^\d+$/.test(amount) ? Number(amount) : null,
    currency: (field(text, "Lite_Currency_AlphaCode") || "").toUpperCase() || null,
    merchantReference: field(text, "MerchantReference") || field(text, "Ecom_ConsumerOrderID") || null,
    nonce: field(text, "LC_Nonce") || null,
  };
}

export type PaymentResultKind = "approved" | "declined" | "cancelled" | "retry_later" | "pending" | "error" | "second_charge";

export interface PaymentResult {
  result: PaymentResultKind;
  cardStatus: number | null;
  title: string;
  message: string;
}

export function classifyCardStatus(cardStatus: number | null, kind?: string): PaymentResult {
  const r = (result: PaymentResultKind, title: string, message: string): PaymentResult => ({ result, cardStatus, title, message });
  switch (cardStatus) {
    case 0:
      return r("approved", "Payment approved", "Thank you. Your payment of USD 2,250 has been approved.");
    case 3:
      return r("declined", "Card not accepted", "Your bank did not accept this card. No money was taken. Please try another card or contact your bank.");
    case 4:
      return r("declined", "Payment declined", "Your bank declined the payment. No money was taken. Please check your card details or try another card.");
    case 5:
      return r("declined", "Please contact your bank", "Your bank needs you to contact them before this payment can go through. No money was taken. You can try again afterwards.");
    case 9:
      return r("retry_later", "Payment could not be processed", "The payment could not be processed right now. No money was taken. Please try again in a few minutes.");
    case 14:
      return r("declined", "Invalid card number", "The card number was not valid. No money was taken. Please check the number and try again.");
    case 255:
      return r(
        "declined",
        "This card needs an extra security check",
        "Cards that ask for a 3-D Secure check can't be used yet. No money was taken. Please try a different card, or contact LakeCity Accounts.",
      );
    case null:
      if (kind === "success") return r("pending", "Checking your payment", "We haven't received a result from the bank yet. Please check again in a moment.");
      return r("cancelled", "Payment cancelled", "The payment was cancelled and no money was taken. You can try again whenever you're ready.");
    default:
      return r("error", "Payment not completed", "The payment did not go through and no money was taken. Please try again, or contact LakeCity Accounts if it keeps happening.");
  }
}

export type AttemptStatus = "started" | "approved" | "declined" | "cancelled" | "retry_later" | "pending" | "error" | "dismissed";

export interface PaymentAttempt {
  reference: string;
  applicationId: string;
  standNumber: string;
  amountCents: number;
  nonce: string;
  status: AttemptStatus;
  cardStatus: number | null;
  createdAt: string;
  dismissedAt: string | null;
}

export type ApplyStatus =
  | "applied"
  | "duplicate"
  | "rejected:amount"
  | "rejected:merchant_reference"
  | "rejected:nonce"
  | "unmatched:not_awaiting"
  | "unmatched:already_paid"
  | "unmatched:stand_not_available";

export interface ApplyPaymentInput {
  reference: string;
  merchantReference: string;
  nonce: string;
  applicationId: string;
  standNumber: string;
  amountCents: number;
  paidAt: string;
  source: "iveri" | "mock-iveri";
  emailTo: string;
  emailSubject: string;
  emailHtml: string;
}

export const HELD_MESSAGE =
  "Your bank approved a payment we couldn't apply to this application. LakeCity Accounts will contact you about it; please don't pay again.";

export function secondChargeMessage(reference: string): string {
  return `Your stand is already paid, and the bank approved another charge of ${formatUsd(DUE_NOW_CENTS)} (reference ${reference}). LakeCity Accounts will contact you about that second charge. Please don't pay again.`;
}

export function needsCheckResult(message: string = HELD_MESSAGE): PaymentResult {
  return { result: "error", cardStatus: 0, title: "We need to check this payment", message };
}

export function secondChargeResult(reference: string): PaymentResult {
  return {
    result: "second_charge",
    cardStatus: 0,
    title: "A second charge needs a refund",
    message: secondChargeMessage(reference),
  };
}

export function isHold(attempt: Pick<PaymentAttempt, "status" | "cardStatus" | "dismissedAt">): boolean {
  return !attempt.dismissedAt && attempt.status === "error" && attempt.cardStatus === 0;
}

export function isSettled(attempt: Pick<PaymentAttempt, "status" | "cardStatus" | "dismissedAt">): boolean {
  return attempt.status === "approved" || isHold(attempt);
}

export function storedResult(attempt: Pick<PaymentAttempt, "status" | "cardStatus">, kind?: string): PaymentResult {
  if (attempt.status === "approved") return classifyCardStatus(0);
  if (attempt.status === "error" && attempt.cardStatus === 0) return needsCheckResult();
  return classifyCardStatus(attempt.cardStatus, kind);
}

export interface IveriReturnDeps {
  getAttempt(reference: string): Promise<PaymentAttempt | null>;
  authoriseInfo(reference: string): Promise<AuthoriseInfo>;
  /** Why a held attempt could not be applied, when an event row exists. */
  holdReason?(reference: string): Promise<string | null>;
  applyPayment(input: ApplyPaymentInput): Promise<ApplyStatus>;
  markAttempt(reference: string, status: AttemptStatus, cardStatus: number | null): Promise<void>;
  emailFor(attempt: PaymentAttempt, reference: string): { to: string; subject: string; html: string };
  source: ApplyPaymentInput["source"];
  now?: () => Date;
}

export interface IveriReturnOutcome extends PaymentResult {
  applicationId: string | null;
  reference: string;
  applied: ApplyStatus | null;
  reason: string | null;
}

export async function processIveriReturn(
  deps: IveriReturnDeps,
  input: { reference: string; kind?: string },
): Promise<IveriReturnOutcome> {
  const reference = input.reference.trim();
  const attempt = reference ? await deps.getAttempt(reference) : null;
  if (!attempt || attempt.dismissedAt) {
    return {
      ...classifyCardStatus(-1),
      applicationId: null,
      reference,
      applied: null,
      reason: null,
      message: "We couldn't find this payment. No money was taken by this page. Please start the payment again.",
    };
  }
  const base = { applicationId: attempt.applicationId, reference, applied: null as ApplyStatus | null, reason: null as string | null };
  if (isSettled(attempt)) {
    if (isHold(attempt)) {
      const reason = (await deps.holdReason?.(attempt.reference)) ?? null;
      if (reason === "already_paid") {
        return { ...base, ...secondChargeResult(attempt.reference), applied: "unmatched:already_paid", reason };
      }
      return { ...base, ...needsCheckResult(), applied: null, reason: reason ?? "held" };
    }
    return { ...base, ...storedResult(attempt, input.kind), applied: attempt.status === "approved" ? "duplicate" : null };
  }

  let info: AuthoriseInfo;
  try {
    info = await deps.authoriseInfo(reference);
  } catch {
    return {
      ...base,
      ...classifyCardStatus(null, "success"),
      title: "Checking your payment",
      message: "We couldn't reach the bank to confirm your payment. Please check again in a moment.",
    };
  }

  if (info.cardStatus !== 0) {
    const result = classifyCardStatus(info.cardStatus, input.kind);
    if (info.cardStatus !== null && result.result !== "approved" && result.result !== "second_charge") {
      await deps.markAttempt(reference, result.result, info.cardStatus);
    }
    return { ...base, ...result };
  }

  const paidAt = (deps.now?.() ?? new Date()).toISOString();
  const email = deps.emailFor(attempt, reference);
  const apply = (amountCents: number, merchantReference: string, nonce: string) =>
    deps.applyPayment({
      reference,
      merchantReference,
      nonce,
      applicationId: attempt.applicationId,
      standNumber: attempt.standNumber,
      amountCents,
      paidAt,
      source: deps.source,
      emailTo: email.to,
      emailSubject: email.subject,
      emailHtml: email.html,
    });

  if (info.amountCents !== DUE_NOW_CENTS) {
    const applied = info.amountCents !== null ? await apply(info.amountCents, info.merchantReference || reference, info.nonce || attempt.nonce) : null;
    await deps.markAttempt(reference, "error", 0);
    return { ...base, applied, reason: "amount", ...needsCheckResult() };
  }
  if (!info.merchantReference || info.merchantReference !== reference) {
    const applied = await apply(DUE_NOW_CENTS, info.merchantReference || "", info.nonce || attempt.nonce);
    await deps.markAttempt(reference, "error", 0);
    return { ...base, applied, reason: "merchant_reference", ...needsCheckResult() };
  }
  if (!info.nonce || info.nonce !== attempt.nonce) {
    const applied = await apply(DUE_NOW_CENTS, reference, info.nonce || "");
    await deps.markAttempt(reference, "error", 0);
    return { ...base, applied, reason: "nonce", ...needsCheckResult() };
  }
  if ((info.trace !== null && info.trace !== reference) || (info.currency !== null && info.currency !== "USD")) {
    await deps.markAttempt(reference, "error", 0);
    return { ...base, reason: "trace_or_currency", ...needsCheckResult() };
  }

  const applied = await apply(DUE_NOW_CENTS, info.merchantReference, info.nonce);
  if (applied === "applied" || applied === "duplicate") {
    return { ...base, applied, ...classifyCardStatus(0) };
  }
  await deps.markAttempt(reference, "error", 0);
  if (applied === "unmatched:already_paid") {
    return { ...base, applied, reason: "already_paid", ...secondChargeResult(reference) };
  }
  return {
    ...base,
    applied,
    reason: applied,
    ...needsCheckResult(
      "Your payment was approved, but this stand could not be reserved for you (it may already be sold). LakeCity Accounts will contact you about a refund or another stand; please don't pay again.",
    ),
  };
}

export const STAFF_ATTENTION_MS = 30 * 60 * 1000;

export function isStaffAttention(attempt: PaymentAttempt, nowMs: number, windowMs = STAFF_ATTENTION_MS): boolean {
  if (attempt.dismissedAt || attempt.status === "dismissed" || attempt.status === "approved") return false;
  if (isHold(attempt)) return true;
  const created = Date.parse(attempt.createdAt);
  return Number.isFinite(created) && nowMs - created >= windowMs;
}

export interface ReviewStop {
  kind: "stop";
  status: 409 | 200;
  code: "payment_held" | "already_approved" | "recheck_unavailable" | "second_charge";
  outcome: IveriReturnOutcome;
}

/** Re-check every unsettled attempt before a new card payment can start. */
export async function reviewBeforeStart(deps: IveriReturnDeps, attempts: PaymentAttempt[]): Promise<{ kind: "proceed" } | ReviewStop> {
  const ordered = [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const attempt of ordered) {
    if (attempt.dismissedAt || attempt.status === "dismissed" || isSettled(attempt)) continue;
    const outcome = await processIveriReturn(deps, { reference: attempt.reference });
    if (outcome.result === "pending" && outcome.title === "Checking your payment") {
      return { kind: "stop", status: 409, code: "recheck_unavailable", outcome };
    }
    if (outcome.result === "approved") return { kind: "stop", status: 200, code: "already_approved", outcome };
    if (outcome.result === "second_charge") return { kind: "stop", status: 409, code: "second_charge", outcome };
    if (outcome.result === "error" && outcome.cardStatus === 0) {
      return { kind: "stop", status: 409, code: "payment_held", outcome };
    }
  }
  for (const attempt of ordered) {
    const current = await deps.getAttempt(attempt.reference);
    if (!current || current.dismissedAt || current.status === "dismissed") continue;
    if (current.status === "approved") {
      return {
        kind: "stop",
        status: 200,
        code: "already_approved",
        outcome: { ...storedResult(current), applicationId: current.applicationId, reference: current.reference, applied: "duplicate", reason: null },
      };
    }
    if (isHold(current)) {
      return {
        kind: "stop",
        status: 409,
        code: "payment_held",
        outcome: { ...needsCheckResult(), applicationId: current.applicationId, reference: current.reference, applied: null, reason: "held" },
      };
    }
  }
  return { kind: "proceed" };
}

export async function recheckAllAttempts(deps: IveriReturnDeps, attempts: PaymentAttempt[]): Promise<IveriReturnOutcome[]> {
  const ordered = [...attempts].filter((a) => !a.dismissedAt && a.status !== "dismissed").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const outcomes: IveriReturnOutcome[] = [];
  for (const attempt of ordered) {
    // Settled approvals skip the gateway inside processIveriReturn. Holds read the recorded reason
    // so an already-paid second charge is not reported as a plain approval.
    outcomes.push(await processIveriReturn(deps, { reference: attempt.reference }));
  }
  return outcomes;
}

export function summariseChecks(outcomes: IveriReturnOutcome[]): IveriReturnOutcome | null {
  const second = outcomes.find((o) => o.result === "second_charge" || o.reason === "already_paid");
  if (second) return second.result === "second_charge" ? second : { ...second, ...secondChargeResult(second.reference) };
  const approved = outcomes.find((o) => o.result === "approved");
  if (approved) return approved;
  const held = outcomes.find((o) => o.cardStatus === 0 && o.result === "error");
  if (held) return held;
  return outcomes[outcomes.length - 1] ?? null;
}

export function paymentIsHeld(result: Pick<PaymentResult, "result" | "cardStatus"> | null | undefined): boolean {
  if (!result) return false;
  return result.cardStatus === 0 && result.result !== "approved";
}
