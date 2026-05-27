#!/usr/bin/env node
/**
 * Post Lake City opening-balance stand sales journal entries to Odoo from:
 *   COLLECTION SCHEDULE - JE for [OPENING BALANCES] (1).xlsx
 *
 * Walkthrough tab "02 Initial Contract":
 *   JE1 — Dr AR (121000) / Cr Contract Liabilities (212010) / Cr Deferred Output VAT (251020)
 * Then for TOTAL PAID > 0 (steps 03/05):
 *   Receipt Dr Bank / Cr AR, Revenue/VAT release Dr CL + Deferred VAT / Cr Revenue + VAT Output
 *
 * Target AR (partner receivable) after posting = Column N "Accounts Receivable".
 * Stand number is the unique customer identifier and must match res.partner / loan contract.
 *
 * Usage:
 *   node scripts/post-opening-balance-jes.mjs --parse-only
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --dry-run
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --stand 3072
 *
 * Env: ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const VAT_RATE = 0.155;
const argv = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const dryRun = argv.has("--dry-run");
const parseOnly = argv.has("--parse-only");

/** Positional args, excluding values consumed by --flag value pairs. */
function positionalArgs() {
  const raw = process.argv.slice(2);
  const skip = new Set();
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "--stand" || a === "--sheet") {
      if (raw[i + 1] && !raw[i + 1].startsWith("--")) skip.add(i + 1);
    }
  }
  return raw.filter((a, i) => !a.startsWith("--") && !skip.has(i));
}

const standFilter = (() => {
  const idx = process.argv.indexOf("--stand");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : "";
})();

const DEFAULT_SOURCE = path.join(
  process.cwd(),
  "COLLECTION SCHEDULE - JE for [OPENING BALANCES] (1).xlsx",
);

function resolveSourcePath() {
  if (process.env.OPENING_BALANCE_XLSX) return process.env.OPENING_BALANCE_XLSX;
  for (const arg of positionalArgs()) {
    if (/\.xlsx?$/i.test(arg) || fs.existsSync(arg)) return arg;
  }
  return DEFAULT_SOURCE;
}

const sourcePath = resolveSourcePath();
const OPENING_BALANCE_ROUTE = "/lakecity/api/v1/loan/opening-balance/post";

const odooOrigin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
const apiToken = process.env.LAKECITY_LOAN_API_TOKEN || "";
const odooHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiToken}`,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseMoney(val) {
  if (val == null) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[$£€,\s]/g, "").replace(/^\(/, "-").replace(/\)$/, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normStand(raw) {
  const s = String(raw ?? "").trim().replace(/^#/, "");
  if (!s) return "";
  const n = Number.parseFloat(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s.toUpperCase();
}

function excelDateToISO(raw) {
  if (raw == null) return new Date().toISOString().slice(0, 10);
  if (raw instanceof Date && !Number.isNaN(+raw)) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + raw * 86400000).toISOString().slice(0, 10);
  }
  const t = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(+d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function contractSplits(totalPrice, colO, colP, isExclusive) {
  const gross = totalPrice;
  if (isExclusive) {
    return {
      gross,
      contractLiability: colO > 0 ? colO : Math.round(gross * (1 - VAT_RATE) * 100) / 100,
      deferredVat: colP > 0 ? colP : Math.round(gross * VAT_RATE * 100) / 100,
    };
  }
  const deferredVat = colP > 0 ? colP : Math.round((gross - gross / (1 + VAT_RATE)) * 100) / 100;
  const contractLiability =
    colO + colP > 0 ? colO + colP : Math.round((gross / (1 + VAT_RATE)) * 100) / 100;
  return { gross, contractLiability, deferredVat };
}

function loadRows() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Workbook not found: ${sourcePath}`);
  }
  const wb = XLSX.read(fs.readFileSync(sourcePath), { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => /36mo/i.test(n) && !/back/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const header = rows[0].map((h) => String(h ?? "").trim());
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const standIdx = idx("Stand Number");
  const arIdx = idx("Accounts Receivable");
  const clIdx = header.findIndex((h) => h.toLowerCase().startsWith("contract liabilities"));
  const vatIdx = idx("VAT");
  const tpIdx = idx("TOTAL PRICE");
  const paidIdx = idx("TOTAL PAID");
  const depIdx = idx("Deposit");
  const vatTypeIdx = idx("Agreement Type (VAT)");
  const startIdx = idx("START DATE");
  const fnIdx = idx("First Name");
  const lnIdx = idx("Last Name");
  const emailIdx = idx("Email");
  const phoneIdx = header.findIndex((h) => /contact number/i.test(h));
  const payIdx = idx("PAYMENT");

  if ([standIdx, arIdx, clIdx, vatIdx, tpIdx, paidIdx].some((i) => i < 0)) {
    throw new Error("Missing required columns in Collection Schedule - 36mo sheet");
  }

  /** @type {any[]} */
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const stand = normStand(row[standIdx]);
    if (!stand) continue;
    if (standFilter && stand !== normStand(standFilter)) continue;

    const arTarget = parseMoney(row[arIdx]);
    if (arTarget <= 0) continue;

    const totalPrice = parseMoney(row[tpIdx]);
    const totalPaid = parseMoney(row[paidIdx]);
    const colO = parseMoney(row[clIdx]);
    const colP = parseMoney(row[vatIdx]);
    const vatType = String(row[vatTypeIdx] ?? "");
    const isExclusive = /exclusive/i.test(vatType);
    const splits = contractSplits(totalPrice, colO, colP, isExclusive);
    const first = fnIdx >= 0 ? String(row[fnIdx] ?? "").trim() : "";
    const last = lnIdx >= 0 ? String(row[lnIdx] ?? "").trim() : "";
    const name = [first, last].filter(Boolean).join(" ").trim() || `Stand ${stand}`;

    out.push({
      stand,
      name,
      email: emailIdx >= 0 ? String(row[emailIdx] ?? "").trim() : "",
      phone: phoneIdx >= 0 ? String(row[phoneIdx] ?? "").trim() : "",
      totalPrice,
      totalPaid,
      deposit: depIdx >= 0 ? parseMoney(row[depIdx]) : 0,
      monthlyPayment: payIdx >= 0 ? parseMoney(row[payIdx]) : 0,
      arTarget,
      colO,
      colP,
      vatType,
      isExclusive,
      ...splits,
      paymentStart: startIdx >= 0 ? excelDateToISO(row[startIdx]) : new Date().toISOString().slice(0, 10),
      impliedAr: Math.round((splits.gross - totalPaid) * 100) / 100,
      externalUid: `collection-csv-${stand}`,
    });
  }
  return out;
}

async function odooPost(route, body) {
  if (parseOnly) return { ok: true };
  const url = `${odooOrigin}${route}`;
  if (dryRun) {
    console.log(`[DRY] POST ${route}`, JSON.stringify(body).slice(0, 240));
    return { ok: true };
  }
  const res = await fetch(url, { method: "POST", headers: odooHeaders, body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    if (res.status === 404 && route === OPENING_BALANCE_ROUTE) {
      throw new Error(
        "HTTP 404 — opening-balance API not deployed. Push lakecity_loan_management ≥ 19.0.1.0.49 to Odoo.sh and upgrade the module, then retry.",
      );
    }
    throw new Error(`HTTP ${res.status} ${route}: ${text.slice(0, 400)}`);
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(`HTTP ${res.status} ${route}: ${json?.error || text.slice(0, 400)}`);
  }
  return json;
}

async function assertOpeningBalanceApiReady() {
  if (parseOnly || dryRun) return;
  const res = await fetch(`${odooOrigin}${OPENING_BALANCE_ROUTE}`, {
    method: "POST",
    headers: odooHeaders,
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 404 || (text.startsWith("<!") && text.includes("<html"))) {
    console.error(
      [
        "",
        "The opening-balance API is not available on this Odoo instance (HTTP 404).",
        "Deploy and upgrade lakecity_loan_management version 19.0.1.0.49+ first:",
        "  1. Commit/push odoo/addons/lakecity_loan_management (api.py + lakecity_stand_accounting.py)",
        "  2. On Odoo.sh: upgrade “Lakecity BNPL Loan Management”",
        "  3. Re-run: node --env-file=.env scripts/post-opening-balance-jes.mjs",
        "",
        "Until then, use the generated workbook:",
        "  docs/output/LakeCity-Opening-Balance-JEs.xlsx",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}

async function odooGet(route) {
  if (parseOnly) return { ok: true, contract: null };
  const res = await fetch(`${odooOrigin}${route}`, { headers: odooHeaders });
  const json = await res.json();
  if (!res.ok || json?.ok === false) return { ok: false, error: json?.error || res.status };
  return json;
}

async function main() {
  const rows = loadRows();
  console.log(`Loaded ${rows.length} stand(s) from ${path.basename(sourcePath)}`);
  if (standFilter) console.log(`Filter: stand ${standFilter}`);

  if (!parseOnly && !dryRun && (!odooOrigin || !apiToken)) {
    console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN (or use --parse-only / --dry-run)");
    process.exit(1);
  }

  await assertOpeningBalanceApiReady();

  let ok = 0;
  let skipped = 0;
  let failures = 0;
  let arGaps = 0;

  for (const row of rows) {
    const arDelta = Math.round((row.arTarget - row.impliedAr) * 100) / 100;
    if (Math.abs(arDelta) > 0.02) {
      console.warn(`WARN stand ${row.stand}: Column N (${row.arTarget}) ≠ gross−paid (${row.impliedAr})`);
    }

    try {
      const existing = await odooGet(`/lakecity/api/v1/loan/get?stand_number=${encodeURIComponent(row.stand)}`);
      const curBal = existing?.contract?.current_balance;
      const curPaid = existing?.contract?.total_paid;

      const loanBody = {
        external_uid: row.externalUid,
        stand_number: row.stand,
        partner: {
          email: row.email || undefined,
          name: row.name,
          phone: row.phone || undefined,
        },
        term_months: 36,
        due_day: 5,
        payment_start_date: row.paymentStart,
        total_price: row.totalPrice,
        deposit_amount: row.deposit,
        tax_rate: 15.5,
        is_vat_inclusive: !row.isExclusive,
        agreement_signed_seller: true,
        agreement_signed_buyer: true,
        state: "active",
        generate_schedule: true,
        activate: false,
        create_crm_lead_first: false,
      };

      if (!parseOnly) {
        await odooPost(OPENING_BALANCE_ROUTE, {
          stand_number: row.stand,
          external_uid: row.externalUid,
          accounts_receivable: row.arTarget,
          contract_liability: row.contractLiability,
          deferred_vat: row.deferredVat,
          total_paid: row.totalPaid,
          total_price: row.totalPrice,
          is_vat_inclusive: !row.isExclusive,
          payment_date: row.paymentStart,
          loan: loanBody,
        });
      }

      ok++;
      if (existing?.contract && curBal != null) {
        const gap = Math.round((curBal - row.arTarget) * 100) / 100;
        if (Math.abs(gap) > 0.02) {
          arGaps++;
          console.log(
            `  stand ${row.stand}: Odoo AR ${curBal.toFixed(2)} → target ${row.arTarget.toFixed(2)} (Δ ${gap.toFixed(2)}), paid ${curPaid ?? "?"} → ${row.totalPaid}`,
          );
        }
      }

      console.log(
        `OK  stand ${row.stand} ${row.name}: JE1 gross ${row.gross.toFixed(2)} | CL ${row.contractLiability.toFixed(2)} | Def VAT ${row.deferredVat.toFixed(2)} | paid ${row.totalPaid.toFixed(2)} | target AR ${row.arTarget.toFixed(2)}`,
      );
    } catch (e) {
      failures++;
      console.error(`FAIL stand ${row.stand}:`, e.message);
    }
    await sleep(parseOnly ? 0 : 80);
  }

  console.log(`\nDone: ${ok} processed, ${skipped} skipped, ${failures} failures`);
  if (arGaps) console.log(`${arGaps} stand(s) had Odoo balance gaps before posting (review after deploy)`);
  if (dryRun || parseOnly) console.log("(no HTTP sent)");
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
