#!/usr/bin/env node
/**
 * Import Lake City "Collection Schedule" CSV → Odoo Lakecity BNPL (and implicitly res.partner).
 *
 * Flow (operational): CRM/Contacts visibility is the same contact record as Accounting & BNPL use.
 * This script calls the BNPL HTTP API, which upserts partners with customer_rank when the field
 * exists — so one automation path is: run this after backing up Odoo. Optionally tag partners in Odoo
 * CRM (see docs/odoo-crm-accounting-bnpl-pipeline.md).
 *
 * Balance truth: uses CSV **TOTAL PAID** and **Deposit**; posts one opening **lakecity.loan.payment**
 * for (TOTAL PAID − Deposit) so Odoo's computed balance matches **Current Balance** when
 *   TOTAL PRICE ≈ TOTAL PAID + Current Balance (warns if not).
 *
 * Usage:
 *   node --env-file=.env scripts/import-collection-schedule-csv-to-odoo.mjs /path/to/schedule.csv --dry-run
 *   node --env-file=.env scripts/import-collection-schedule-csv-to-odoo.mjs /path/to/schedule.csv
 *
 * Env: ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN (same as lakecity_loan.api_token)
 *
 * Flags: --dry-run, --parse-only (validate CSV only, no HTTP), --skip-internal (skip tester/internal stands)
 *         --skip-crm-lead (omit create_crm_lead_first on loan/upsert; default is CRM lead **first**)
 */

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { parse as parseDate, isValid } from "date-fns";
import { enGB } from "date-fns/locale/en-GB";

const argv = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const argsNonFlags = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = argv.has("--dry-run");
const parseOnly = argv.has("--parse-only");
const skipInternal = argv.has("--skip-internal");
const skipCrmLead = argv.has("--skip-crm-lead");

const csvPath = argsNonFlags[0] || process.env.COLLECTION_CSV_PATH || "";
const odooOrigin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
const apiToken = process.env.LAKECITY_LOAN_API_TOKEN || "";

const odooHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiToken}`,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normHeader(h) {
  return String(h ?? "")
    .replace(/^\ufeff/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Money like "$16,000.00" or "$0.00" */
function parseMoney(val) {
  if (val == null) return 0;
  const s = String(val).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[$£€,\s]/g, "").replace(/^\(/, "-").replace(/\)$/, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(val, fallback = 36) {
  const n = Number.parseInt(String(val ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStartDate(raw) {
  if (raw == null) return null;
  let t = String(raw).trim();
  if (!t) return null;
  t = t.replace(/^I\s+/i, "1 ").replace(/^l\s+/i, "1 ");
  const formats = ["d MMMM yyyy", "d MMM yyyy", "dd/MM/yyyy", "M/d/yyyy"];
  for (const f of formats) {
    const d = parseDate(t, f, new Date(), { locale: enGB });
    if (isValid(d)) return d.toISOString().slice(0, 10);
  }
  const fallback = new Date(t);
  if (isValid(fallback)) return fallback.toISOString().slice(0, 10);
  return null;
}

function cleanEmail(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  const first = s.split(/[\s,;-]+/)[0];
  s = first || s;
  s = s.replace(/\s*@\s*/, "@").trim().toLowerCase();
  if (!s.includes("@")) return "";
  return s;
}

function cleanPhone(raw) {
  if (raw == null) return "";
  const lines = String(raw)
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] || "";
  return first.replace(/[^\d+().\-\s]/g, "").trim().slice(0, 32);
}

function rowByNorm(row) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normHeader(k)] = v == null ? "" : String(v);
  }
  return out;
}

function pick(r, names) {
  for (const n of names) {
    const k = normHeader(n);
    if (r[k] !== undefined && String(r[k]).trim() !== "") return r[k];
  }
  return "";
}

function isInternalStand(stand, category) {
  const s = String(stand).trim().toUpperCase();
  const cat = String(category || "").toLowerCase();
  if (["999999", "777777", "5555577"].includes(s)) return true;
  if (skipInternal && (cat.includes("internal") || cat.includes("tester"))) return true;
  return false;
}

async function odooPost(path, body) {
  if (parseOnly) return { ok: true };
  const url = `${odooOrigin}${path}`;
  if (dryRun) {
    console.log(`[DRY] POST ${path}`, JSON.stringify(body).slice(0, 180) + "…");
    return { ok: true };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: odooHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(`HTTP ${res.status} ${path}: ${json?.error || text.slice(0, 400)}`);
  }
  return json;
}

async function main() {
  if (!csvPath) {
    console.error("Missing CSV path. Pass the file as the first argument, e.g.");
    console.error('  node scripts/import-collection-schedule-csv-to-odoo.mjs "/Users/you/Downloads/schedule.csv" --skip-internal');
    console.error("Or set COLLECTION_CSV_PATH=/absolute/path/to/file.csv");
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found:", csvPath);
    console.error("Use the real path to your file — not the placeholder /path/to/your/file.csv");
    process.exit(1);
  }

  const buf = fs.readFileSync(csvPath, "utf8");
  /** @type {Record<string, string>[]} */
  const rows = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });

  if (!parseOnly && !dryRun) {
    if (!odooOrigin || !apiToken) {
      console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN (or use --parse-only / --dry-run)");
      process.exit(1);
    }
  }

  let ok = 0;
  let skipped = 0;
  let failures = 0;

  for (const raw of rows) {
    const r = rowByNorm(raw);
    const standRaw = pick(r, ["Stand Number", "Stand"]);
    const standNum = String(standRaw || "")
      .trim()
      .replace(/^#/, "");
    const stand = standNum ? standNum.toUpperCase() : "";

    if (!stand || /^totals$/i.test(stand)) continue;

    const category = pick(r, ["Customer Category"]);
    if (isInternalStand(stand, category)) {
      skipped++;
      continue;
    }

    const first = pick(r, ["First Name"]);
    const last = pick(r, ["Last Name"]);
    const name = [first, last]
      .filter((x) => String(x || "").trim())
      .join(" ")
      .trim() || `Stand ${stand}`;

    const email = cleanEmail(pick(r, ["Email"]));
    const phone = cleanPhone(pick(r, ["Contact Number", "Phone"]));

    const totalPrice = parseMoney(pick(r, ["TOTAL PRICE", "Total price"]));
    const deposit = parseMoney(pick(r, ["Deposit"]));
    const termMonths = parseIntSafe(pick(r, ["NUMBER OF INSTALLMENTS", "Number of installments"]), 36);
    const totalPaid = parseMoney(pick(r, ["TOTAL PAID", "Total paid"]));
    const currentBal = parseMoney(pick(r, ["Current Balance", "Current balance"]));
    const startRaw = pick(r, ["START DATE", "Start date"]);
    const paymentStart = parseStartDate(startRaw) || new Date().toISOString().slice(0, 10);

    const vatType = pick(r, ["Agreement Type (VAT)", "Agreement Type"]);
    const isVatInclusive = !/exclusive/i.test(vatType);

    const agreementSeller = /^true$/i.test(pick(r, ["Agreement signed by Warwickshire"]));
    const agreementBuyer = /^true$/i.test(pick(r, ["Agreement signed by client"]));
    const agreementUrl = pick(r, ["Agreement of sale file", "Agreement of sale file "]).trim();

    if (totalPrice <= 0) {
      console.warn(`SKIP stand ${stand}: missing or zero TOTAL PRICE`);
      skipped++;
      continue;
    }

    const impliedPaid = totalPrice - currentBal;
    const deltaPaid = Math.abs(impliedPaid - totalPaid);
    if (totalPaid > 0 && currentBal > 0 && deltaPaid > 1.0) {
      console.warn(
        `WARN stand ${stand}: TOTAL PAID (${totalPaid.toFixed(2)}) vs TOTAL PRICE − Current Balance (${impliedPaid.toFixed(2)}) differ by ${deltaPaid.toFixed(2)}`,
      );
    }

    const installmentPayments = Math.max(0, totalPaid - deposit);
    const externalUid = `collection-csv-${stand}`;

    const loanBody = {
      external_uid: externalUid,
      stand_number: stand,
      partner: {
        email: email || undefined,
        name,
        phone: phone || undefined,
      },
      term_months: termMonths,
      due_day: 5,
      payment_start_date: paymentStart,
      total_price: totalPrice,
      deposit_amount: deposit,
      tax_rate: 0,
      is_vat_inclusive: isVatInclusive,
      agreement_signed_seller: agreementSeller,
      agreement_signed_buyer: agreementBuyer,
      agreement_file_url: agreementUrl || "",
      state: "active",
      generate_schedule: true,
      activate: true,
      create_crm_lead_first: !skipCrmLead,
    };

    try {
      if (parseOnly) {
        ok++;
        continue;
      }
      await odooPost("/lakecity/api/v1/loan/upsert", loanBody);
      ok++;

      if (installmentPayments > 0) {
        await sleep(60);
        const payBody = {
          external_uid: `collection-csv-opening-${stand}`,
          contract_external_uid: externalUid,
          amount: installmentPayments,
          payment_date: paymentStart,
          source: "manual",
          reference: "CSV collection schedule opening (TOTAL PAID − Deposit)",
          state: "posted",
        };
        await odooPost("/lakecity/api/v1/payment/post", payBody);
      } else {
        console.warn(` stand ${stand}: TOTAL PAID ≤ Deposit — no installment payment line posted`);
      }
    } catch (e) {
      failures++;
      console.error(`FAIL stand ${stand}:`, e.message);
    }

    await sleep(parseOnly ? 0 : 80);
  }

  console.log(
    `\nDone. ${parseOnly ? "validated rows" : "upserted+payments"}: ${ok} ok, skipped ${skipped}, failures ${failures}`,
  );
  if (dryRun || parseOnly) console.log("(no HTTP sent)");
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
