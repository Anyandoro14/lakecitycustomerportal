// iVeri Lite (CBZ acquirer) hosted card payments: shared core.
// Pure logic + injected Store/Recorder so the same code runs in Supabase edge
// functions (Deno) and in the local test harness (Node 24 type-stripping).
// Secrets (App IDs, shared secret) come from env only. Never log them.

export type IveriEnv = "test" | "live";

export interface IveriConfig {
  env: IveriEnv;
  gatewayHost: string; // e.g. portal.host.iveri.com (CBZ TBC; test App ID only accepted here on 17 Nov 2026)
  appId: string; // Test or Live Application ID (GUID). SECRET.
  sharedSecret: string | null; // Lite Shared Secret. SECRET. Null until CBZ sets it in BackOffice.
  tokenVerification: boolean; // send Lite_Transaction_Token (requires sharedSecret)
  currency: string; // USD (ZiG TBC)
  returnBaseUrl: string; // https://<backend>/functions/v1/iveri-return
  portalBaseUrl: string; // SPA origin for result pages
  minAmountCents: number;
  abandonAfterMinutes: number; // sweep marks unknown orders abandoned after this
}

export const ALLOWED_GATEWAYS = ["portal.host.iveri.com", "portal.nedsecure.co.za"];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build config from env. Live mode is refused unless IVERI_LIVE_ENABLED=yes (Alex's own yes only). */
export function loadIveriConfig(get: (k: string) => string | undefined): IveriConfig {
  const env = (get("IVERI_ENV") || "test").toLowerCase() as IveriEnv;
  if (env !== "test" && env !== "live") throw new Error("IVERI_ENV must be test or live");
  if (env === "live" && get("IVERI_LIVE_ENABLED") !== "yes") {
    throw new Error("iVeri live mode is locked (IVERI_LIVE_ENABLED != yes)");
  }
  const appId = (env === "live" ? get("IVERI_LIVE_APP_ID") : get("IVERI_TEST_APP_ID")) || "";
  if (!GUID.test(appId)) throw new Error(`iVeri ${env} Application ID missing or malformed`);
  const gatewayHost = get("IVERI_GATEWAY_HOST") || "portal.host.iveri.com";
  if (!ALLOWED_GATEWAYS.includes(gatewayHost)) throw new Error("IVERI_GATEWAY_HOST not allowed");
  const sharedSecret = get("IVERI_SHARED_SECRET") || null;
  const tokenVerification = (get("IVERI_TOKEN_VERIFICATION") || "off") === "on";
  if (tokenVerification && !sharedSecret) throw new Error("IVERI_TOKEN_VERIFICATION=on needs IVERI_SHARED_SECRET");
  if (sharedSecret && !/^[A-Za-z0-9]{1,32}$/.test(sharedSecret)) throw new Error("Shared secret must be alphanumeric <= 32");
  const returnBaseUrl = get("IVERI_RETURN_BASE_URL") || "";
  const portalBaseUrl = get("IVERI_PORTAL_BASE_URL") || "";
  if (!returnBaseUrl || !portalBaseUrl) throw new Error("IVERI_RETURN_BASE_URL and IVERI_PORTAL_BASE_URL required");
  return {
    env, gatewayHost, appId, sharedSecret, tokenVerification,
    currency: (get("IVERI_CURRENCY") || "USD").toUpperCase(),
    returnBaseUrl: returnBaseUrl.replace(/\/$/, ""),
    portalBaseUrl: portalBaseUrl.replace(/\/$/, ""),
    minAmountCents: Number(get("IVERI_MIN_AMOUNT_CENTS") || "100"),
    abandonAfterMinutes: Number(get("IVERI_ABANDON_AFTER_MINUTES") || "60"),
  };
}

/** Redact App IDs / secret from any string before logging. */
export function redact(cfg: Pick<IveriConfig, "appId" | "sharedSecret">, s: string): string {
  let out = String(s);
  for (const v of [cfg.appId, cfg.sharedSecret]) {
    if (v) out = out.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[redacted]");
  }
  return out;
}

export function appIdField(appId: string): string {
  return `{${appId.toUpperCase()}}`;
}

export function toCents(amount: number | string): number {
  const s = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount");
  const [w, f = ""] = s.split(".");
  const cents = Number(w) * 100 + Number((f + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0 || String(cents).length > 10) throw new Error("Invalid amount");
  return cents;
}

export function sanitizeStand(stand: string): string {
  const s = String(stand).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s || s.length > 10) throw new Error("Invalid stand number");
  return s;
}

/** ST<stand>-<seq>, max 20 chars (Ecom_ConsumerOrderID limit). */
export function buildReference(stand: string, seq: number): string {
  const ref = `ST${sanitizeStand(stand)}-${String(seq).padStart(6, "0")}`;
  if (ref.length > 20) throw new Error("Reference too long");
  return ref;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lite_Transaction_Token = time + ":" + sha256(secret + time + resource + {APPID} + amount + email). */
export async function buildTransactionToken(
  secret: string, appId: string, amountCents: number, email: string, unixTs: number,
  resource = "/Lite/Authorise.aspx",
): Promise<string> {
  const t = String(unixTs);
  return `${t}:${await sha256Hex(secret + t + resource + appIdField(appId) + String(amountCents) + email)}`;
}

export function randomHex(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Outcome = "approved" | "declined" | "trylater" | "error" | "cancelled" | "unknown";

/** Map Lite_Payment_Card_Status to outcome. -255 = AuthoriseInfo "no transaction found". */
export function classifyStatus(code: string | number | null | undefined): Outcome {
  if (code === null || code === undefined || code === "") return "unknown";
  const n = Number(code);
  if (!Number.isFinite(n)) return "unknown";
  if (n === 0) return "approved";
  if (n === -255) return "unknown";
  if ([1, 2, 5, 9].includes(n)) return "trylater";
  if (n === 255) return "error";
  return "declined";
}

export interface Billing {
  email: string; firstName?: string; lastName?: string; phone?: string;
  address?: string; city?: string; postalCode?: string; countryCode?: string;
}

export interface Order {
  reference: string; // ST<stand>-<seq> (Ecom_ConsumerOrderID / MerchantReference)
  trace: string; // Lite_Merchant_Trace
  nonce: string; // LC_Nonce custom field (echoed back)
  stand: string;
  amountCents: number;
  currency: string;
  env: IveriEnv;
  state: "initiated" | "approved_pending_recon" | "declined" | "trylater" | "error" | "cancelled" | "abandoned" | "amount_mismatch";
  idempotencyKey: string;
  billing: Billing;
  createdAt: string;
  updatedAt: string;
  result?: Record<string, string>; // safe fields only
  odooPaymentId?: number | string | null;
  flags?: string[];
}

export interface Store {
  nextSeq(stand: string): Promise<number>;
  findByIdempotencyKey(key: string): Promise<Order | null>;
  insert(o: Order): Promise<void>;
  getByReference(ref: string): Promise<Order | null>;
  getByTrace(trace: string): Promise<Order | null>;
  /** Compare-and-set: apply patch only if current state === expected. Returns updated order or null. */
  transition(ref: string, expected: Order["state"], patch: Partial<Order>): Promise<Order | null>;
  update(ref: string, patch: Partial<Order>): Promise<void>;
  listInitiatedOlderThan(cutoffIso: string): Promise<Order[]>;
  /** Approved orders whose Odoo pending record failed earlier. */
  listNeedingOdoo(): Promise<Order[]>;
}

export interface Recorder {
  /** Record a verified approval as PENDING reconciliation (never posted/allocated). Idempotent by reference. */
  recordPending(o: Order): Promise<{ id: number | string | null }>;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; text(): Promise<string> }>;

export interface Deps { cfg: IveriConfig; store: Store; recorder: Recorder; fetch: Fetch; now?: () => Date; log?: (m: string) => void }

export interface InitInput {
  stand: string; amount: number | string; maxAmount?: number | string | null; idempotencyKey: string; billing: Billing;
}

const SAFE_RESULT_FIELDS = [
  "Lite_Payment_Card_Status", "Lite_Result_Description", "MerchantReference", "Lite_Merchant_Trace",
  "Lite_Order_Amount", "Lite_Order_AuthorisationCode", "Lite_BankReference", "Lite_TransactionDate",
  "Lite_TransactionIndex", "Lite_Order_Terminal", "Ecom_Payment_Card_Number", "Lite_Currency_AlphaCode",
];

/** Normalise field names case-insensitively (iVeri echoes UPPERCASE on some paths). */
export function normaliseFields(f: Record<string, string>): Record<string, string> {
  const want = [...SAFE_RESULT_FIELDS, "LC_Nonce", "Ecom_ConsumerOrderID"];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    const m = want.find((w) => w.toLowerCase() === k.toLowerCase());
    if (m) out[m] = String(v);
  }
  return out;
}

export function safeResult(f: Record<string, string>): Record<string, string> {
  const n = normaliseFields(f);
  const out: Record<string, string> = {};
  for (const k of SAFE_RESULT_FIELDS) if (n[k] !== undefined) out[k] = n[k];
  // PAN must already be masked by iVeri; enforce anyway (keep first 4 / last 4).
  if (out.Ecom_Payment_Card_Number) {
    const d = out.Ecom_Payment_Card_Number.replace(/[^0-9]/g, "");
    if (d.length >= 12) out.Ecom_Payment_Card_Number = `${d.slice(0, 4)}........${d.slice(-4)}`;
  }
  return out;
}

export async function initOrder(deps: Deps, input: InitInput): Promise<{ order: Order; action: string; fields: Record<string, string>; reused: boolean }> {
  const { cfg, store } = deps;
  if (!input.idempotencyKey || input.idempotencyKey.length > 80) throw new Error("idempotencyKey required");
  const prior = await store.findByIdempotencyKey(input.idempotencyKey);
  let order: Order;
  let reused = false;
  if (prior) {
    if (prior.state !== "initiated") throw new Error(`Order ${prior.reference} already ${prior.state}; start a new payment`);
    order = prior; reused = true;
  } else {
    const stand = sanitizeStand(input.stand);
    const amountCents = toCents(input.amount);
    if (amountCents < cfg.minAmountCents) throw new Error("Amount below minimum");
    if (input.maxAmount !== undefined && input.maxAmount !== null && amountCents > toCents(input.maxAmount)) {
      throw new Error("Amount above outstanding balance");
    }
    const email = String(input.billing.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 40) throw new Error("Valid billing email (<=40) required");
    const seq = await store.nextSeq(stand);
    const nowIso = (deps.now?.() ?? new Date()).toISOString();
    order = {
      reference: buildReference(stand, seq),
      trace: `LC${randomHex(15)}`, // 32 chars, unique per request
      nonce: randomHex(16),
      stand, amountCents, currency: cfg.currency, env: cfg.env, state: "initiated",
      idempotencyKey: input.idempotencyKey,
      billing: { ...input.billing, email },
      createdAt: nowIso, updatedAt: nowIso, flags: [],
    };
    await store.insert(order);
  }
  return { order, reused, ...(await buildAuthoriseForm(deps, order)) };
}

export async function buildAuthoriseForm(deps: Deps, o: Order): Promise<{ action: string; fields: Record<string, string> }> {
  const { cfg } = deps;
  const r = (p: string) => `${cfg.returnBaseUrl}/${p}`;
  const b = o.billing;
  const f: Record<string, string> = {
    Lite_Merchant_ApplicationId: appIdField(cfg.appId),
    Lite_Order_Amount: String(o.amountCents),
    Lite_Currency_AlphaCode: o.currency,
    Lite_Website_Successful_Url: r("success"),
    Lite_Website_Fail_Url: r("fail"),
    Lite_Website_TryLater_Url: r("trylater"),
    Lite_Website_Error_Url: r("error"),
    Lite_Order_LineItems_Product_1: `LakeCity Stand ${o.stand} instalment`.slice(0, 40),
    Lite_Order_LineItems_Quantity_1: "1",
    Lite_Order_LineItems_Amount_1: String(o.amountCents),
    Ecom_ConsumerOrderID: o.reference,
    Lite_ConsumerOrderID_PreFix: "ST", // gateway requires it even when we supply our own ID
    Ecom_Payment_Card_Protocols: "iVeri", // gateway rejects the form without it
    Ecom_BillTo_Online_Email: b.email,
    Ecom_TransactionComplete: "False",
    Lite_Version: "4.0",
    Lite_Merchant_Trace: o.trace,
    LC_Nonce: o.nonce,
  };
  const opt: [string, string | undefined][] = [
    ["Ecom_BillTo_Postal_Name_First", b.firstName], ["Ecom_BillTo_Postal_Name_Last", b.lastName],
    ["Ecom_BillTo_Telecom_Phone_Number", b.phone], ["Ecom_BillTo_Postal_Street_Line1", b.address],
    ["Ecom_BillTo_Postal_City", b.city], ["Ecom_BillTo_Postal_PostalCode", b.postalCode],
    ["Ecom_BillTo_Postal_CountryCode", b.countryCode],
  ];
  for (const [k, v] of opt) if (v) f[k] = String(v).slice(0, 40);
  if (cfg.tokenVerification && cfg.sharedSecret) {
    const ts = Math.floor((deps.now?.() ?? new Date()).getTime() / 1000);
    f.Lite_Transaction_Token = await buildTransactionToken(cfg.sharedSecret, cfg.appId, o.amountCents, b.email, ts);
  }
  return { action: `https://${cfg.gatewayHost}/Lite/Authorise.aspx`, fields: f };
}

export function parseHiddenInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input\b[^>]*>/gi;
  for (const tag of html.match(re) ?? []) {
    const name = /\bname="([^"]*)"/i.exec(tag)?.[1];
    const value = /\bvalue="([^"]*)"/i.exec(tag)?.[1] ?? "";
    if (name) out[name] = value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
  }
  return out;
}

/** Source of truth: POST AppId + Trace to /Lite/AuthoriseInfo.aspx. */
export async function queryAuthoriseInfo(deps: Deps, trace: string): Promise<Record<string, string>> {
  const body = new URLSearchParams({ Lite_Merchant_ApplicationId: appIdField(deps.cfg.appId), Lite_Merchant_Trace: trace }).toString();
  const res = await deps.fetch(`https://${deps.cfg.gatewayHost}/Lite/AuthoriseInfo.aspx`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (res.status !== 200) throw new Error(`AuthoriseInfo HTTP ${res.status}`);
  return normaliseFields(parseHiddenInputs(await res.text()));
}

export interface ReturnResult { page: "approved" | "declined" | "trylater" | "error" | "cancelled"; reference: string | null; state: Order["state"] | "unknown_order"; recorded: boolean; note?: string }

/**
 * Return handler for all 4 URLs. Never trusts posted status: verifies nonce, then
 * AuthoriseInfo, then amount/currency, then settles with compare-and-set (idempotent).
 */
export async function handleReturn(deps: Deps, path: string, posted: Record<string, string>): Promise<ReturnResult> {
  const p = normaliseFields(posted);
  const trace = p.Lite_Merchant_Trace;
  const ref = p.MerchantReference || p.Ecom_ConsumerOrderID;
  let order = trace ? await deps.store.getByTrace(trace) : null;
  if (!order && ref) order = await deps.store.getByReference(ref);
  if (!order) return { page: "error", reference: null, state: "unknown_order", recorded: false, note: "unknown order" };
  if (order.state !== "initiated") {
    // Replay / refresh / duplicate return: show existing outcome, change nothing.
    return { page: pageFor(order.state), reference: order.reference, state: order.state, recorded: false, note: "already settled" };
  }
  const flags: string[] = [];
  if (p.LC_Nonce !== undefined && p.LC_Nonce !== order.nonce) flags.push("nonce_mismatch");
  const postedOutcome: Outcome = Number(p.Lite_Payment_Card_Status) === 255 && /cancel/i.test(p.Lite_Result_Description ?? "")
    ? "cancelled" // hosted-page Cancel posts 255 "Transaction cancelled by customer" to the Error URL
    : classifyStatus(p.Lite_Payment_Card_Status);
  return await settle(deps, order, flags, path, postedOutcome);
}

function pageFor(state: Order["state"]): ReturnResult["page"] {
  switch (state) {
    case "approved_pending_recon": return "approved";
    case "declined": return "declined";
    case "trylater": case "initiated": case "abandoned": return "trylater";
    case "cancelled": return "cancelled";
    default: return "error";
  }
}

async function settle(deps: Deps, order: Order, flags: string[], path: string | null, posted: Outcome = "unknown"): Promise<ReturnResult> {
  const info = await queryAuthoriseInfo(deps, order.trace);
  const outcome = classifyStatus(info.Lite_Payment_Card_Status);
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const result = safeResult(info);
  if (outcome === "unknown") {
    // AuthoriseInfo has no completed transaction (-255). A posted NON-approval
    // (declined / try-later / gateway error such as "Missing Application MerchantCity")
    // is safe to accept because it can never create a payment. A posted approval is
    // NEVER accepted without AuthoriseInfo status 0 (forged or not yet visible).
    if (path !== null && posted !== "approved" && posted !== "unknown") {
      const st: Order["state"] = posted === "cancelled" ? "cancelled" : posted === "declined" ? "declined" : posted === "trylater" ? "trylater" : "error";
      const u = await deps.store.transition(order.reference, "initiated", { state: st, result, updatedAt: nowIso, flags: [...(order.flags ?? []), ...flags, "unverified_non_approval"] });
      if (u) return { page: pageFor(st), reference: order.reference, state: st, recorded: false };
    }
    if (path === "cancel") {
      const u = await deps.store.transition(order.reference, "initiated", { state: "cancelled", result, updatedAt: nowIso, flags: [...(order.flags ?? []), ...flags] });
      if (u) return { page: "cancelled", reference: order.reference, state: "cancelled", recorded: false };
    }
    return { page: "trylater", reference: order.reference, state: "initiated", recorded: false, note: posted === "approved" ? "approval not confirmed by AuthoriseInfo" : "no transaction yet" };
  }
  if (outcome === "approved") {
    const amountOk = Number(info.Lite_Order_Amount) === order.amountCents;
    const refOk = !info.MerchantReference || info.MerchantReference === order.reference;
    const curOk = !info.Lite_Currency_AlphaCode || info.Lite_Currency_AlphaCode.toUpperCase() === order.currency;
    if (!amountOk) flags.push("amount_mismatch");
    if (!refOk) flags.push("reference_mismatch");
    if (!curOk) flags.push("currency_mismatch");
    if (!amountOk || !refOk || !curOk) {
      const u = await deps.store.transition(order.reference, "initiated", { state: "amount_mismatch", result, updatedAt: nowIso, flags: [...(order.flags ?? []), ...flags] });
      deps.log?.(`iveri ${order.reference} approved but mismatched (${flags.join(",")}): human queue`);
      return { page: "error", reference: order.reference, state: u ? "amount_mismatch" : order.state, recorded: false, note: flags.join(",") };
    }
    const u = await deps.store.transition(order.reference, "initiated", { state: "approved_pending_recon", result, updatedAt: nowIso, flags: [...(order.flags ?? []), ...flags] });
    if (!u) {
      const cur = await deps.store.getByReference(order.reference);
      return { page: pageFor(cur!.state), reference: order.reference, state: cur!.state, recorded: false, note: "concurrent settle" };
    }
    let recorded = false;
    try {
      const r = await deps.recorder.recordPending(u);
      await deps.store.update(order.reference, { odooPaymentId: r.id });
      recorded = true;
    } catch (e) {
      deps.log?.(`iveri ${order.reference} Odoo record failed: ${redact(deps.cfg, String(e))} (sweep will retry)`);
      await deps.store.update(order.reference, { flags: [...(u.flags ?? []), "odoo_record_pending"] });
    }
    return { page: "approved", reference: order.reference, state: "approved_pending_recon", recorded };
  }
  const state: Order["state"] = outcome === "declined" ? "declined" : outcome === "trylater" ? "trylater" : "error";
  await deps.store.transition(order.reference, "initiated", { state, result, updatedAt: nowIso, flags: [...(order.flags ?? []), ...flags] });
  return { page: pageFor(state), reference: order.reference, state, recorded: false };
}

/** Sweep: settle open orders older than 15 min via AuthoriseInfo; abandon after cfg.abandonAfterMinutes; retry failed Odoo records. */
export async function sweep(deps: Deps, olderThanMinutes = 15, abandonAfterMinutes = deps.cfg.abandonAfterMinutes): Promise<{ checked: number; settled: Record<string, number> }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000).toISOString();
  const open = await deps.store.listInitiatedOlderThan(cutoff);
  const settled: Record<string, number> = {};
  for (const o of open) {
    const r = await settle(deps, o, [], null);
    let state = r.state as string;
    if (r.state === "initiated" && now.getTime() - Date.parse(o.createdAt) >= abandonAfterMinutes * 60_000) {
      const u = await deps.store.transition(o.reference, "initiated", { state: "abandoned", updatedAt: now.toISOString() });
      if (u) state = "abandoned";
    }
    settled[state] = (settled[state] ?? 0) + 1;
  }
  for (const o of await deps.store.listNeedingOdoo()) {
    try {
      const r = await deps.recorder.recordPending(o);
      await deps.store.update(o.reference, { odooPaymentId: r.id, flags: (o.flags ?? []).filter((f) => f !== "odoo_record_pending") });
      settled.odoo_retried = (settled.odoo_retried ?? 0) + 1;
    } catch (e) {
      deps.log?.(`iveri ${o.reference} Odoo retry failed: ${redact(deps.cfg, String(e))}`);
    }
  }
  return { checked: open.length, settled };
}
