// iVeri Lite, Full Redirect (Alex, 2026-11-25: iVeri Lite card payments are THE payment solution).
//
// 1. Our server builds the signed form (fixed USD 2,250, merchant reference = stand number + a per-attempt
//    suffix) and the browser posts it to the iVeri hosted payment page. Card details never touch this app.
// 2. iVeri sends the browser back to our return handler. The posted fields are NOT trusted: the handler asks
//    iVeri's AuthoriseInfo for the result server-side.
// 3. Only AuthoriseInfo card status 0 calls the payment-confirmed handler (apply_payment_confirmed). Any
//    other status changes nothing and shows a friendly retry message.
//
// TEST environment only (portal.host.iveri.com with the TEST App ID). The App ID and shared secret come from
// environment variables; never hard-code or log them. No Live App ID: Live/Production needs Alex's own yes
// (OI-TBC-33). Pure, dependency-free code: Web Crypto only, so it runs in the browser, Node and Deno.

export const IVERI_TEST_GATEWAY_URL = "https://portal.host.iveri.com/Lite/Authorise.aspx";
export const IVERI_TEST_AUTHORISE_INFO_URL = "https://portal.host.iveri.com/Lite/AuthoriseInfo.aspx";
/** Resource string hashed into Lite_Transaction_Token (must match the hosted payment page path). */
const TOKEN_RESOURCE = "/Lite/Authorise.aspx";

export interface IveriConfig {
  environment: "test";
  applicationId: string;
  /** Only when "Enable Token Verification" is on in iVeri BackOffice. */
  sharedSecret: string | null;
  gatewayUrl: string;
  authoriseInfoUrl: string;
}

/** Reads the iVeri settings from env. Card payments stay off unless a TEST App ID is configured. */
export function iveriConfigFromEnv(get: (key: string) => string | undefined): IveriConfig | { disabled: string } {
  const environment = (get("IVERI_ENVIRONMENT") || "test").trim().toLowerCase();
  if (environment !== "test") return { disabled: "Only the iVeri TEST environment is allowed (Live needs Alex's approval, OI-TBC-33)." };
  const applicationId = (get("IVERI_APPLICATION_ID") || "").trim();
  if (!applicationId) return { disabled: "Card payments are not configured (IVERI_APPLICATION_ID is not set)." };
  return {
    environment: "test",
    applicationId,
    sharedSecret: (get("IVERI_SHARED_SECRET") || "").trim() || null,
    gatewayUrl: (get("IVERI_GATEWAY_URL") || "").trim() || IVERI_TEST_GATEWAY_URL,
    authoriseInfoUrl: (get("IVERI_AUTHORISE_INFO_URL") || "").trim() || IVERI_TEST_AUTHORISE_INFO_URL,
  };
}

export function bracedApplicationId(raw: string): string {
  return `{${raw.trim().replace(/^\{|\}$/g, "").toUpperCase()}}`;
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Merchant reference (max 20 chars, shown on statements): "LC" + stand number + "-" + a random suffix,
 * so every attempt is unique while the stand stays readable. Also used as Lite_Merchant_Trace.
 */
export function newMerchantReference(standNumber: string, random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const stand = standNumber.trim().replace(/[^0-9A-Za-z]/g, "").slice(0, 8);
  if (!stand) throw new Error("Stand number is required for the merchant reference.");
  const suffix = [...random(8)].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
  return `LC${stand}-${suffix}`.slice(0, 20);
}

/** Stand number encoded in a merchant reference, or null. */
export function standFromReference(reference: string): string | null {
  return /^LC([0-9A-Za-z]{1,8})-[A-Z0-9]+$/.exec(reference.trim())?.[1] ?? null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lite_Transaction_Token = "<unix time>:" + sha256(secret + time + resource + appId + amount + email). */
export async function liteTransactionToken(input: { secret: string; applicationIdBraced: string; amountCents: string; email: string; nowSeconds: number }) {
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
  description: string;
  /** Our return handler; iVeri appends nothing, so the trace and outcome kind go in the query string. */
  returnUrl: string;
  now?: Date;
}): Promise<LiteForm> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Invalid payment amount.");
  const amount = String(input.amountCents);
  const appId = bracedApplicationId(input.config.applicationId);
  const email = input.email.trim().slice(0, 40);
  if (!email) throw new Error("Email is required for card payments.");
  const reference = input.reference.trim().slice(0, 20);
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
  /** Lite_Payment_Card_Status; null when iVeri has no completed transaction for the trace (e.g. cancelled). */
  cardStatus: number | null;
  description: string;
  trace: string | null;
  amountCents: number | null;
  /** Lite_Currency_AlphaCode when AuthoriseInfo returns it. */
  currency: string | null;
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

/** Parses an AuthoriseInfo response (HTML form, URL-encoded or XML). Unknown shapes give cardStatus null. */
export function parseAuthoriseInfo(text: string): AuthoriseInfo {
  const status = field(text, "Lite_Payment_Card_Status");
  const amount = field(text, "Lite_Order_Amount");
  return {
    cardStatus: status && /^\d+$/.test(status) ? Number(status) : null,
    description: (field(text, "Lite_Result_Description") ?? "").slice(0, 200),
    trace: field(text, "Lite_Merchant_Trace") || null,
    amountCents: amount && /^\d+$/.test(amount) ? Number(amount) : null,
    currency: (field(text, "Lite_Currency_AlphaCode") || "").toUpperCase() || null,
  };
}

export type PaymentResultKind = "approved" | "declined" | "cancelled" | "retry_later" | "pending" | "error";

export interface PaymentResult {
  result: PaymentResultKind;
  cardStatus: number | null;
  title: string;
  message: string;
}

/** Friendly copy per AuthoriseInfo status. Only status 0 is a payment; everything else changes nothing. */
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

export interface PaymentAttempt {
  reference: string;
  leadId: string;
  standNumber: string;
  amountCents: number;
  status: "started" | PaymentResultKind;
  cardStatus: number | null;
  createdAt: string;
}

export interface ApplyPaymentInput {
  reference: string;
  leadId: string;
  standNumber: string;
  amountCents: number;
  paidAt: string;
  source: "iveri" | "mock-iveri";
}

/** "applied" | "duplicate" | "unmatched" | "rejected", as returned by apply_payment_confirmed. */
export type ApplyStatus = "applied" | "duplicate" | "unmatched" | "rejected";

export const NEEDS_CHECK: Pick<PaymentResult, "title" | "message"> = {
  title: "We need to check this payment",
  message: "Your bank approved a payment we couldn't apply to this application. LakeCity Accounts will contact you about it; please don't pay again.",
};

/** The bank approved (status 0) but the payment wasn't applied. cardStatus 0 tells the UI not to offer a retry. */
export function needsCheckResult(message: string = NEEDS_CHECK.message): PaymentResult {
  return { result: "error", cardStatus: 0, title: NEEDS_CHECK.title, message };
}

/**
 * Settled for good: the payment was applied, or the bank approved it but it needs a staff check. Every other
 * attempt (declined, cancelled, no answer yet) is re-checked with AuthoriseInfo each time, so a late approval
 * is never lost.
 */
export function isSettled(attempt: Pick<PaymentAttempt, "status" | "cardStatus">): boolean {
  return attempt.status === "approved" || (attempt.status === "error" && attempt.cardStatus === 0);
}

/** Result for an attempt that has already been settled (no gateway call). */
export function storedResult(attempt: Pick<PaymentAttempt, "status" | "cardStatus">, kind?: string): PaymentResult {
  if (attempt.status === "approved") return classifyCardStatus(0);
  if (attempt.status === "error" && attempt.cardStatus === 0) return needsCheckResult();
  return classifyCardStatus(attempt.cardStatus, kind);
}

export interface IveriReturnDeps {
  getAttempt(reference: string): Promise<PaymentAttempt | null>;
  /** Server-side AuthoriseInfo lookup by Lite_Merchant_Trace. */
  authoriseInfo(reference: string): Promise<AuthoriseInfo>;
  /**
   * Only ever called for card status 0. Returns the recorded outcome; a repeat of an applied reference is
   * "duplicate", a repeat of an unmatched/rejected one returns that outcome again.
   */
  applyPayment(input: ApplyPaymentInput): Promise<ApplyStatus>;
  /** Must never overwrite a settled attempt (see isSettled). */
  markAttempt(reference: string, status: PaymentAttempt["status"], cardStatus: number | null): Promise<void>;
  source: ApplyPaymentInput["source"];
  now?: () => Date;
}

export interface IveriReturnOutcome extends PaymentResult {
  leadId: string | null;
  reference: string;
  applied: ApplyStatus | null;
}

/**
 * Return / notify handler. Safe to call any number of times for the same reference: AuthoriseInfo is the
 * only source of truth and apply_payment_confirmed records each reference once.
 */
export async function processIveriReturn(deps: IveriReturnDeps, input: { reference: string; kind?: string }): Promise<IveriReturnOutcome> {
  const reference = input.reference.trim();
  const attempt = reference ? await deps.getAttempt(reference) : null;
  if (!attempt) {
    return { ...classifyCardStatus(-1), leadId: null, reference, applied: null, message: "We couldn't find this payment. No money was taken by this page. Please start the payment again." };
  }
  const base = { leadId: attempt.leadId, reference, applied: null as ApplyStatus | null };
  if (isSettled(attempt)) return { ...base, ...storedResult(attempt, input.kind) };

  let info: AuthoriseInfo;
  try {
    info = await deps.authoriseInfo(reference);
  } catch {
    return { ...base, ...classifyCardStatus(null, "success"), title: "Checking your payment", message: "We couldn't reach the bank to confirm your payment. Please check again in a moment." };
  }

  if (info.cardStatus !== 0) {
    // No status yet (still on the card page, cancelled, or not found) is never stored: a later check can still approve.
    const result = classifyCardStatus(info.cardStatus, input.kind);
    if (info.cardStatus !== null) await deps.markAttempt(reference, result.result, info.cardStatus);
    return { ...base, ...result };
  }

  // Status 0: the gateway's own amount (and trace and currency, when returned) must match this attempt.
  const paidAt = (deps.now?.() ?? new Date()).toISOString();
  const apply = (amountCents: number) => deps.applyPayment({ reference, leadId: attempt.leadId, standNumber: attempt.standNumber, amountCents, paidAt, source: deps.source });
  if (info.amountCents !== attempt.amountCents) {
    if (info.amountCents !== null) await apply(info.amountCents);
    await deps.markAttempt(reference, "error", 0);
    return { ...base, applied: info.amountCents !== null ? "rejected" : null, ...needsCheckResult() };
  }
  if ((info.trace !== null && info.trace !== reference) || (info.currency !== null && info.currency !== "USD")) {
    await deps.markAttempt(reference, "error", 0);
    return { ...base, ...needsCheckResult() };
  }

  const applied = await apply(info.amountCents);
  if (applied === "applied" || applied === "duplicate") {
    return { ...base, applied, ...classifyCardStatus(0) };
  }
  await deps.markAttempt(reference, "error", 0);
  return {
    ...base,
    applied,
    ...needsCheckResult("Your payment was approved, but this stand could not be reserved for you (it may already be sold). LakeCity Accounts will contact you about a refund or another stand; please don't pay again."),
  };
}
