#!/usr/bin/env node
/**
 * One-way migration: Supabase (contracts + approved payment_receipts) → Odoo BNPL
 * (lakecity.loan.contract / lakecity.loan.payment via HTTP API).
 *
 * Prerequisites
 *   - Odoo: module lakecity_loan_management installed; Settings → Technical →
 *     Parameters → lakecity_loan.api_token set (see odoo/addons/.../ODOO_SH.md).
 *   - Supabase: service role key (bypasses RLS). Do NOT commit it.
 *
 * Environment (load via `node --env-file=.env` or export):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (or MIGRATE_SUPABASE_SERVICE_ROLE_KEY)
 *   ODOO_ORIGIN                 e.g. https://anyandoro14-standledger.odoo.com  (no trailing slash)
 *   LAKECITY_LOAN_API_TOKEN     same value as lakecity_loan.api_token in Odoo
 *   TENANT_SLUG                 default lakecity
 *
 * Optional:
 *   DRY_RUN=1                   log actions only, no HTTP writes to Odoo
 *   SKIP_PREFLIGHT=1            skip Supabase reachability + Odoo health (not recommended)
 *   MIGRATE_CONTINUE_ON_ERROR=1 keep going after a failed contract/payment
 *   CREATE_CRM_LEAD_FIRST=1     if set, POST /loan/upsert creates CRM lead before partner+contract
 *
 * CLI (overrides env when passed):
 *   --dry-run            same as DRY_RUN=1
 *   --preflight-only     validate env + connectivity, then exit 0 (or 1 on failure)
 *   --skip-preflight     same as SKIP_PREFLIGHT=1
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-supabase-to-odoo-bnpl.mjs --preflight-only
 *   node --env-file=.env scripts/migrate-supabase-to-odoo-bnpl.mjs --dry-run
 *   node --env-file=.env scripts/migrate-supabase-to-odoo-bnpl.mjs
 */

import { createClient } from "@supabase/supabase-js";

const argv = new Set(process.argv.slice(2));
const cliDryRun = argv.has("--dry-run");
const cliPreflightOnly = argv.has("--preflight-only");
const cliSkipPreflight = argv.has("--skip-preflight");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MIGRATE_SUPABASE_SERVICE_ROLE_KEY;
let odooOrigin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
const apiToken = process.env.LAKECITY_LOAN_API_TOKEN;
const tenantSlug = process.env.TENANT_SLUG || "lakecity";
const envDryRun = ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());
const dryRun = cliDryRun || envDryRun;
const skipPreflight =
  cliSkipPreflight ||
  ["1", "true", "yes"].includes(String(process.env.SKIP_PREFLIGHT || "").toLowerCase());
const continueOnError = ["1", "true", "yes"].includes(
  String(process.env.MIGRATE_CONTINUE_ON_ERROR || "").toLowerCase(),
);
const createCrmLeadFirst = ["1", "true", "yes"].includes(
  String(process.env.CREATE_CRM_LEAD_FIRST || "").toLowerCase(),
);

const ODOO_POST_MAX_RETRIES = Number(process.env.MIGRATE_ODOO_RETRIES || 4);

function maskUrl(u) {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}`;
  } catch {
    return "(invalid URL)";
  }
}

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

function validateUrlShapes() {
  requireEnv("SUPABASE_URL", supabaseUrl);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY (or MIGRATE_...)", serviceKey);
  requireEnv("ODOO_ORIGIN", odooOrigin);
  requireEnv("LAKECITY_LOAN_API_TOKEN", apiToken);

  let supParsed;
  try {
    supParsed = new URL(supabaseUrl);
  } catch {
    console.error("SUPABASE_URL is not a valid URL.");
    process.exit(1);
  }
  if (supParsed.protocol !== "https:") {
    console.warn("WARN: SUPABASE_URL should normally use https.");
  }

  let odParsed;
  try {
    odParsed = new URL(odooOrigin);
  } catch {
    console.error("ODOO_ORIGIN is not a valid URL.");
    process.exit(1);
  }
  if (odParsed.protocol !== "https:") {
    console.warn("WARN: ODOO_ORIGIN should use https in production.");
  }
  if (String(odParsed.pathname || "/") !== "/" || odParsed.search || odParsed.hash) {
    console.error(
      'ODOO_ORIGIN must be origin only (e.g. https://foo.odoo.com) — no path, trailing slash already stripped.',
    );
    process.exit(1);
  }

  odooOrigin = `${odParsed.protocol}//${odParsed.host}`;
  console.log(`Supabase ${maskUrl(supabaseUrl)} | Odoo ${odooOrigin} | service role key length ${serviceKey.length}`);
}

const supabase = createClient(supabaseUrl || "https://invalid.local", serviceKey || "x", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const odooHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiToken || ""}`,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * @returns {Promise<{ ok: boolean, status: number, json?: object, text: string }>}
 */
async function odooFetchOnce(method, path, body) {
  const url = `${odooOrigin}${path}`;
  const init = {
    method,
    headers:
      method === "GET"
        ? { Authorization: odooHeaders.Authorization }
        : { ...odooHeaders },
  };
  if (body !== undefined && method !== "GET") init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (path.startsWith("/lakecity/api/v1/")) {
    const looksJsonObj = typeof json === "object" && json !== null;
    const looksLikeOdooEnvelope = typeof json?.ok === "boolean";
    if (!looksJsonObj || !looksLikeOdooEnvelope) {
      const snippet = text.replace(/\s+/g, " ").slice(0, 120);
      return {
        ok: false,
        status: res.status,
        json,
        text: snippet || `(empty ${res.status})`,
      };
    }
  }
  const businessOk = json && typeof json.ok === "boolean" ? json.ok : res.ok;
  return { ok: res.ok && businessOk, status: res.status, json, text };
}

async function odooRequestWithRetry(method, path, body) {
  let lastFail;
  const maxAttempts = ODOO_POST_MAX_RETRIES + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const r = await odooFetchOnce(method, path, body);
      if (r.ok) return r.json ?? { ok: true };
      lastFail = r;
      if (
        attempt < maxAttempts - 1 &&
        (isRetriableStatus(r.status) || /rate|busy|gateway|timeout/i.test(r.text))
      ) {
        const waitMs = Math.min(8000, 400 * 2 ** attempt);
        console.warn(`  retry ${attempt + 1}/${maxAttempts - 1} after HTTP ${r.status} (${waitMs}ms)`);
        await sleep(waitMs);
        continue;
      }
      const snippet = r.text.slice(0, 500);
      throw new Error(`HTTP ${r.status} ${path}: ${snippet}`);
    } catch (e) {
      if (
        attempt < maxAttempts - 1 &&
        (e?.cause?.code === "ECONNRESET" || /fetch failed|network|ENOTFOUND|EAI_AGAIN/i.test(String(e.message)))
      ) {
        const waitMs = Math.min(8000, 400 * 2 ** attempt);
        console.warn(`  retry ${attempt + 1}/${maxAttempts - 1} after transport error (${waitMs}ms)`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
  const r = lastFail;
  throw new Error(`HTTP ${r?.status ?? "?"} ${path}: ${r?.text?.slice?.(0, 500)}`);
}

async function odooPost(path, body) {
  if (dryRun && path !== "/lakecity/api/v1/health") {
    console.log(`[DRY_RUN] POST ${path}`, JSON.stringify(body).slice(0, 200) + "…");
    return { ok: true, dry: true };
  }
  const json = await odooRequestWithRetry("POST", path, body);
  if (json && json.ok === false) {
    throw new Error(`Odoo error ${path}: ${json.error || JSON.stringify(json)}`);
  }
  return json;
}

async function odooGet(path) {
  const json = await odooRequestWithRetry("GET", path, undefined);
  if (json && json.ok === false) {
    throw new Error(`Odoo error ${path}: ${json.error || JSON.stringify(json)}`);
  }
  return json;
}

function mapGateway(gw) {
  const g = String(gw || "manual").toLowerCase();
  const allowed = new Set(["manual", "kuva", "paystack", "paypal", "flutterwave", "odoo"]);
  return allowed.has(g) ? g : "manual";
}

/** Map Supabase contracts.status → lakecity.loan.contract state (+ whether to activate). */
function mapContractStatus(raw) {
  const s = String(raw || "active").toLowerCase();
  const allowed = new Set(["draft", "active", "closed", "defaulted"]);
  if (allowed.has(s)) return { state: s, activate: s === "active" };
  return { state: "draft", activate: false };
}

async function main() {
  const { data: tenant, error: te } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (te || !tenant) {
    const { data: rows } = await supabase.from("tenants").select("slug").order("slug");
    const slugs = (rows || []).map((r) => r.slug);
    console.error("Tenant not found for slug:", tenantSlug, te?.message);
    if (slugs.length) console.error("Available slugs:", slugs.join(", "));
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`Migrating tenant ${tenant.slug} (${tenantId})`);

  const { data: contracts, error: ce } = await supabase
    .from("contracts")
    .select(
      [
        "id",
        "customer_id",
        "stand_number",
        "total_price",
        "monthly_installment",
        "payment_start_date",
        "status",
        "term_months",
        "deposit_amount",
        "is_vat_inclusive",
        "agreement_signed_seller",
        "agreement_signed_buyer",
        "agreement_file_url",
      ].join(","),
    )
    .eq("tenant_id", tenantId)
    .order("stand_number");
  if (ce) {
    console.error("contracts query failed:", ce.message);
    process.exit(1);
  }
  if (!contracts?.length) {
    console.log("No contracts for tenant — nothing to migrate.");
    return;
  }

  const customerIds = [...new Set(contracts.map((c) => c.customer_id))];
  const { data: profiles, error: pe } = await supabase
    .from("profiles")
    .select("id,email,full_name,stand_number,phone_number")
    .in("id", customerIds);
  if (pe) {
    console.error("profiles query failed:", pe.message);
    process.exit(1);
  }
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  const { data: receipts, error: re } = await supabase
    .from("payment_receipts")
    .select("id, stand_number, amount, payment_date, gateway, gateway_reference")
    .eq("tenant_id", tenantId)
    .eq("qc_status", "approved")
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (re) {
    console.error("payment_receipts query failed:", re.message);
    process.exit(1);
  }

  console.log(`Rows to process: contracts=${contracts.length}, approved receipts=${(receipts || []).length}`);

  /** @type {Map<string, typeof receipts>} */
  const receiptsByStand = new Map();
  for (const r of receipts || []) {
    const stand = String(r.stand_number || "").trim().toUpperCase();
    if (!stand) continue;
    if (!receiptsByStand.has(stand)) receiptsByStand.set(stand, []);
    receiptsByStand.get(stand).push(r);
  }

  const standSeen = new Map();
  for (const c of contracts) {
    const stand = String(c.stand_number || "").trim().toUpperCase();
    if (standSeen.has(stand)) {
      console.error(
        `FATAL: duplicate stand_number in contracts (${stand}). Fix data before migrating.`,
      );
      process.exit(1);
    }
    standSeen.set(stand, c.id);
  }

  let okContracts = 0;
  let okPayments = 0;
  let failContracts = 0;
  let failPayments = 0;

  for (const c of contracts) {
    const stand = String(c.stand_number || "").trim().toUpperCase();
    const profile = profileById.get(c.customer_id);
    if (!profile) {
      console.warn(`SKIP contract ${c.id} stand ${stand}: profile ${c.customer_id} not found`);
      failContracts++;
      if (!continueOnError) process.exit(1);
      continue;
    }
    const hasReach = !!(profile.email && String(profile.email).trim())
      || !!(profile.phone_number && String(profile.phone_number).trim());
    if (!hasReach && !(profile.full_name && String(profile.full_name).trim())) {
      console.warn(
        `SKIP contract ${c.id} stand ${stand}: profile ${profile.id} missing email, phone, and display name`,
      );
      failContracts++;
      if (!continueOnError) process.exit(1);
      continue;
    }

    const partner = {
      email: profile.email || undefined,
      name:
        (profile.full_name || "").trim() ||
        (profile.phone_number ? String(profile.phone_number).trim() : "") ||
        profile.email ||
        `Stand ${stand}`,
      phone: profile.phone_number || undefined,
    };

    const { state: odooState, activate: activateLoan } = mapContractStatus(c.status);

    const loanBody = {
      external_uid: c.id,
      stand_number: stand,
      partner,
      term_months: Number(c.term_months) || 36,
      due_day: 5,
      payment_start_date: c.payment_start_date,
      total_price: Number(c.total_price),
      deposit_amount: Number(c.deposit_amount ?? 0),
      tax_rate: 0,
      is_vat_inclusive:
        c.is_vat_inclusive === null || c.is_vat_inclusive === undefined
          ? true
          : Boolean(c.is_vat_inclusive),
      agreement_signed_seller: Boolean(c.agreement_signed_seller),
      agreement_signed_buyer: Boolean(c.agreement_signed_buyer),
      agreement_file_url: c.agreement_file_url || "",
      state: odooState,
      generate_schedule: true,
      activate: activateLoan,
      create_crm_lead_first: createCrmLeadFirst,
    };

    try {
      await odooPost("/lakecity/api/v1/loan/upsert", loanBody);
      okContracts++;
      console.log(`Contract OK stand=${stand} supabase_id=${c.id}`);
    } catch (e) {
      console.error(`Contract FAIL stand=${stand}:`, e.message);
      failContracts++;
      if (!continueOnError) process.exit(1);
      continue;
    }

    await sleep(80);

    const standReceipts = receiptsByStand.get(stand) || [];
    for (const pr of standReceipts) {
      const payBody = {
        external_uid: pr.id,
        contract_external_uid: c.id,
        amount: Number(pr.amount),
        payment_date: pr.payment_date,
        source: mapGateway(pr.gateway),
        reference: pr.gateway_reference ? String(pr.gateway_reference) : `receipt:${pr.id}`,
        state: "posted",
      };
      try {
        await odooPost("/lakecity/api/v1/payment/post", payBody);
        okPayments++;
      } catch (e) {
        console.error(`Payment FAIL receipt=${pr.id} stand=${stand}:`, e.message);
        failPayments++;
        if (!continueOnError) process.exit(1);
      }
      await sleep(50);
    }
  }

  console.log("\n--- summary ---");
  console.log(`contracts: ${okContracts} ok, ${failContracts} failed (${contracts.length} total)`);
  console.log(`payments:  ${okPayments} ok, ${failPayments} failed (${(receipts || []).length} approved receipts)`);
  if (dryRun) console.log("DRY_RUN was enabled — Odoo unchanged.");

  const contractStands = new Set(Array.from(standSeen.keys()));
  let orphanReceipts = 0;
  for (const [stand, list] of receiptsByStand) {
    if (!contractStands.has(stand)) {
      orphanReceipts += list.length;
      console.warn(
        `WARN: ${list.length} approved receipt(s) for stand "${stand}" with no tenant contract row — skipped`,
      );
    }
  }

  console.log(`
Next steps:
  1) Spot-check Odoo: Lakecity Loans → Loan Contracts; open 2–3 stands; installments + paid amounts vs Supabase dashboard.
  2) Compare Supabase column monthly_installment to Odoo's generated schedule — Odoo uses (total_with_tax − deposit) / term ± rounding.
  3) Freeze legacy intake where Odoo becomes source of truth; keep Supabase receipts as audit trail.`);
  if (orphanReceipts) console.log(`Note: orphan receipts skipped: ${orphanReceipts} (no matching contract stand).`);

  if (!dryRun && (failContracts || failPayments)) process.exitCode = 1;
}

async function bootstrap() {
  validateUrlShapes();
  if (skipPreflight) {
    console.warn("SKIP_PREFLIGHT: skipping Odoo GET /health and Supabase roster check before migrate.");
  } else await runPreflight();
  if (cliPreflightOnly) {
    console.log("\nPreflight passed. Remove --preflight-only to migrate.");
    process.exit(0);
  }
  await main();
}

/** Runs after validateUrlShapes — Supabase + Odoo probes + TENANT_SLUG exists. */
async function runPreflight() {
  const { data: tenantRows, error: teAll } = await supabase.from("tenants").select("slug").order("slug");
  if (teAll) {
    console.error("Supabase preflight failed (tenants readable?):", teAll.message);
    process.exit(1);
  }
  const slugs = (tenantRows || []).map((r) => r.slug);
  console.log(`Supabase OK — ${tenantRows?.length ?? 0} tenant row(s); sample: ${slugs.slice(0, 12).join(", ") || "(none)"}`);

  if (!dryRun) {
    try {
      const health = await odooGet("/lakecity/api/v1/health");
      console.log(`Odoo health OK:`, health?.service || "lakecity", health?.version || "");
    } catch (e) {
      console.error("Odoo preflight FAILED (wrong ODOO_ORIGIN / token / module?):", e.message);
      process.exit(1);
    }
  } else {
    console.log("[DRY_RUN] Skipping Odoo health GET.");
  }

  const { data: tenant, error: te } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (te || !tenant) {
    console.error(`Tenant slug "${tenantSlug}" not found.`, te?.message || "");
    if (slugs.length) console.error(`Available slugs: ${slugs.join(", ")}`);
    process.exit(1);
  }
  console.log(`Target tenant OK: ${tenant.slug} (${tenant.id})\n`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
