import { buildEmailProps, emailSubject, EMAIL_ATTACHMENTS } from "../domain/emails.ts";
import {
  bracedApplicationId,
  iveriConfigFromEnv,
  parseAuthoriseInfo,
  processIveriReturn,
  type ApplyPaymentInput,
  type ApplyStatus,
  type AuthoriseInfo,
  type IveriConfig,
  type IveriReturnDeps,
  type PaymentAttempt,
} from "../domain/iveri.ts";
import { rowToLead, rowToStand } from "../domain/rows.ts";
import { HttpError, adminClient, env } from "./http.ts";

/** iVeri TEST config from env, or a 503. The App ID and secret are never logged or returned. */
export function iveriConfig(): IveriConfig {
  const c = iveriConfigFromEnv(env);
  if ("disabled" in c) {
    console.warn("[iveri] card payments disabled:", c.disabled);
    throw new HttpError(503, "Card payments are not available yet. Please try again later or contact LakeCity Accounts.");
  }
  return c;
}

/** Logs a database failure by code only (never row data) and returns a generic client error. */
export function dbFailure(where: string, error: { code?: string } | null): HttpError {
  console.error(`[db] ${where} failed`, error?.code ?? "unknown");
  return new HttpError(500, "Something went wrong. Please try again.");
}

export async function authoriseInfo(config: IveriConfig, reference: string): Promise<AuthoriseInfo> {
  const res = await fetch(config.authoriseInfoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ Lite_Merchant_ApplicationId: bracedApplicationId(config.applicationId), Lite_Merchant_Trace: reference }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.warn(`[iveri] AuthoriseInfo HTTP ${res.status}`);
    throw new Error("AuthoriseInfo unavailable");
  }
  return parseAuthoriseInfo(await res.text());
}

function rowToAttempt(r: Record<string, unknown>): PaymentAttempt {
  return {
    reference: String(r.reference),
    leadId: String(r.lead_id),
    standNumber: String(r.stand_number),
    amountCents: Number(r.amount_cents),
    status: r.status as PaymentAttempt["status"],
    cardStatus: r.card_status === null ? null : Number(r.card_status),
    createdAt: String(r.created_at),
  };
}

export async function getAttempt(reference: string): Promise<PaymentAttempt | null> {
  const { data, error } = await adminClient().from("payment_attempts").select("*").eq("reference", reference).maybeSingle();
  if (error) throw dbFailure("payment_attempts select", error);
  return data ? rowToAttempt(data) : null;
}

export async function latestAttempt(leadId: string): Promise<PaymentAttempt | null> {
  const { data, error } = await adminClient().from("payment_attempts").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw dbFailure("payment_attempts latest", error);
  return data ? rowToAttempt(data) : null;
}

/** Never overwrites a settled attempt (approved, or approved-but-needs-check with card status 0). */
async function markAttempt(reference: string, status: PaymentAttempt["status"], cardStatus: number | null) {
  const { error } = await adminClient()
    .from("payment_attempts")
    .update({ status, card_status: cardStatus, updated_at: new Date().toISOString() })
    .eq("reference", reference)
    .neq("status", "approved")
    .or("card_status.is.null,card_status.neq.0");
  if (error) throw dbFailure("payment_attempts update", error);
}

/** Calls apply_payment_confirmed (one transaction). Only ever reached for AuthoriseInfo card status 0. */
async function applyPayment(input: ApplyPaymentInput): Promise<ApplyStatus> {
  const db = adminClient();
  const [{ data: leadRow, error: leadErr }, { data: standRow, error: standErr }] = await Promise.all([
    db.from("leads").select("*").eq("id", input.leadId).maybeSingle(),
    db.from("stands").select("*").eq("stand_number", input.standNumber).maybeSingle(),
  ]);
  if (leadErr || standErr) throw dbFailure("load lead/stand for payment", leadErr ?? standErr);
  if (!leadRow || !standRow) throw dbFailure("load lead/stand for payment", { code: "not_found" });
  const lead = rowToLead(leadRow);
  const stand = rowToStand(standRow);
  const paidLead = { ...lead, stage: "paid" as const, paidAt: input.paidAt, paymentReference: input.reference, paymentAmountCents: input.amountCents };
  const urls = { appUrl: env("APP_URL") || "http://127.0.0.1:8137", portalUrl: env("PORTAL_URL") || "https://lakecity.standledger.io" };

  const { data, error } = await db.rpc("apply_payment_confirmed", {
    p_reference: input.reference,
    p_stand_number: input.standNumber,
    p_lead_id: input.leadId,
    p_amount_cents: input.amountCents,
    p_paid_at: input.paidAt,
    p_source: input.source,
    p_email_to: lead.contact.email,
    p_email_subject: emailSubject("payment_thank_you", stand.standNumber),
    p_email_props: buildEmailProps(paidLead, { ...stand, status: "paid", reservedLeadId: lead.id }, urls),
    p_email_attachments: EMAIL_ATTACHMENTS.payment_thank_you ?? [],
  });
  if (error) throw dbFailure("apply_payment_confirmed", error);
  const status = String(data) as ApplyStatus;
  console.info(`[payment] ${input.reference.slice(0, 8)}… ${status}`);
  return status;
}

export function iveriDeps(config: IveriConfig, overrides: Partial<IveriReturnDeps> = {}): IveriReturnDeps {
  return {
    getAttempt,
    authoriseInfo: (reference) => authoriseInfo(config, reference),
    applyPayment,
    markAttempt,
    source: "iveri",
    ...overrides,
  };
}

export { processIveriReturn };
