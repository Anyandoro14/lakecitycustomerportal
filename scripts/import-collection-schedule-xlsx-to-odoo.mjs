#!/usr/bin/env node
/**
 * Import Lake City **Collection Schedule** workbook → Odoo BNPL with **granular payments**:
 * one `lakecity.loan.payment` per non-zero monthly cell (columns **M …** up to **Next Payment Column**),
 * dated from the column header (e.g. "5 January 2022").
 *
 * Mirrors sheet economics: TOTAL PAID = Deposit + SUM(monthly columns); posted BNPL installments = SUM(monthlies).
 *
 * Payments with header date **after** `--as-of-date` are skipped (so balances match that cut-off).
 *
 * Usage:
 *   node scripts/import-collection-schedule-xlsx-to-odoo.mjs ./Collection.xlsx --parse-only --skip-internal --as-of-date 2026-04-30
 *   node --env-file=.env scripts/import-collection-schedule-xlsx-to-odoo.mjs ./Collection.xlsx --dry-run --as-of-date 2026-04-30
 *   node --env-file=.env scripts/import-collection-schedule-xlsx-to-odoo.mjs ./Collection.xlsx --sheet "North Ridge - 2022-03-05" --as-of-date 2026-04-30
 *   Wide **CSV** exports use RFC-4180 parsing (`csv-parse`); filenames ending in `.csv` skip `--sheet`.
 *
 * Env: ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN
 *
 * Uses **`collection-csv-<STAND>`** contract `external_uid` (same as the CSV importer) so reruns upsert one contract per stand.
 * Remove any lump BNPL payments from the CSV importer (`external_uid` `collection-csv-opening-<STAND>`
 * / reference “CSV collection schedule opening…”) before posting granular instalments, or balances will double.
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parse as parseCsvWide } from "csv-parse/sync";
import { parse as parseDate, isValid } from "date-fns";
import { enGB } from "date-fns/locale/en-GB";

function normalizeISODate(s) {
  const t = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  return t;
}

const argv = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const argsNonFlags = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = argv.has("--dry-run");
const parseOnly = argv.has("--parse-only");
const skipInternal = argv.has("--skip-internal");
const skipCrmLead = argv.has("--skip-crm-lead");

let asOfISO = "";
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === "--as-of-date" && process.argv[i + 1]) {
    asOfISO = normalizeISODate(process.argv[i + 1]);
    break;
  }
}
if (!asOfISO) {
  console.error('Required: --as-of-date YYYY-MM-DD (e.g. --as-of-date 2026-04-30)');
  process.exit(1);
}

const xlsxPath = argsNonFlags[0] || process.env.COLLECTION_XLSX_PATH || "";
const sheetArg = argv.has("--sheet")
  ? (() => {
      const idx = process.argv.indexOf("--sheet");
      return (process.argv[idx + 1] || "").trim();
    })()
  : "";

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

function parseMoney(val) {
  if (val == null) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
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

function excelSerialToISODate(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + serial * 86400000;
  const d = new Date(ms);
  if (!isValid(d)) return null;
  return d.toISOString().slice(0, 10);
}

function parseStartDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date && !isNaN(+raw)) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") return excelSerialToISODate(raw);
  let t = String(raw).trim();
  if (!t) return null;
  t = t.replace(/^I\s+/i, "1 ").replace(/^l\s+/i, "1 ");
  const formats = ["d MMMM yyyy", "d MMM yyyy", "dd/MM/yyyy", "M/d/yyyy"];
  for (const f of formats) {
    const d = parseDate(t, f, new Date(), { locale: enGB });
    if (isValid(d)) return d.toISOString().slice(0, 10);
  }
  const fallback = new Date(t);
  if (!isNaN(+fallback)) return fallback.toISOString().slice(0, 10);
  return null;
}

/** Column header dates in row 1: "5 January 2022" */
function parseMonthHeader(raw) {
  return parseStartDate(raw);
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

function pickColIndex(headers, names) {
  const normRow = headers.map((h) => normHeader(h));
  for (const n of names) {
    const k = normHeader(n);
    const idx = normRow.findIndex((x) => x === k);
    if (idx !== -1) return idx;
  }
  return -1;
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
    console.log(`[DRY] POST ${path}`, JSON.stringify(body).slice(0, 200) + "…");
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

function pickSheetName(workbook, arg) {
  const names = workbook.SheetNames;
  if (!names.length) throw new Error("Workbook has no sheets");
  if (!arg) {
    for (const nm of names) {
      const ws = workbook.Sheets[nm];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const hdr = data[0] || [];
      if (pickColIndex(hdr, ["Stand Number", "Stand"]) !== -1) return nm;
    }
    return names[0];
  }
  const ix = Number.parseInt(arg, 10);
  if (String(ix) === arg && ix >= 0 && ix < names.length) return names[ix];
  const exact = names.find((n) => n === arg);
  if (exact) return exact;
  const loose = names.find((n) => n.trim().toLowerCase() === arg.toLowerCase());
  if (!loose) throw new Error(`Sheet not found: "${arg}". Available: ${names.join(", ")}`);
  return loose;
}

async function main() {
  if (!xlsxPath) {
    console.error("Missing xlsx path. Example:");
    console.error('  node scripts/import-collection-schedule-xlsx-to-odoo.mjs "./Collection Schedule.xlsx" --as-of-date 2026-04-30 --parse-only');
    process.exit(1);
  }
  if (!fs.existsSync(xlsxPath)) {
    console.error("File not found:", xlsxPath);
    process.exit(1);
  }

  if (!parseOnly && !dryRun) {
    if (!odooOrigin || !apiToken) {
      console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN (or use --parse-only / --dry-run)");
      process.exit(1);
    }
  }

  const isCsv = xlsxPath.toLowerCase().endsWith(".csv");
  let sheetName = "Sheet1";
  /** @type {any[][]} */
  let rows;

  if (isCsv) {
    const buf = fs.readFileSync(xlsxPath, "utf8");
    rows = parseCsvWide(buf, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    });
    sheetName = path.basename(xlsxPath);
  } else {
    const workbook = XLSX.read(fs.readFileSync(xlsxPath), { type: "buffer", cellDates: true });
    sheetName = pickSheetName(workbook, sheetArg);
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      console.error("Missing worksheet:", sheetName);
      process.exit(1);
    }
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  }

  if (!rows.length) {
    console.error(isCsv ? "CSV is empty" : "Sheet is empty:", sheetName);
    process.exit(1);
  }

  const header = rows[0].map((c) => c);
  const standIdx = pickColIndex(header, ["Stand Number", "Stand"]);
  const nextIdx = pickColIndex(header, ["Next Payment Column"]);
  const depositIdx = pickColIndex(header, ["Deposit"]);
  const totalPriceIdx = pickColIndex(header, ["TOTAL PRICE", "Total price"]);
  const termIdx = pickColIndex(header, ["NUMBER OF INSTALLMENTS", "Number of installments"]);
  const startIdx = pickColIndex(header, ["START DATE", "Start date"]);
  const catIdx = pickColIndex(header, ["Customer Category"]);
  const axIdx = pickColIndex(header, ["TOTAL PAID", "Total paid"]);
  const ayIdx = pickColIndex(header, ["Current Balance", "Current balance"]);
  const firstNameIdx = pickColIndex(header, ["First Name"]);
  const lastNameIdx = pickColIndex(header, ["Last Name"]);
  const emailIdx = pickColIndex(header, ["Email"]);
  let contactIdx = pickColIndex(header, ["Contact Number"]);
  if (contactIdx === -1) contactIdx = pickColIndex(header, ["Phone"]);

  if (standIdx === -1 || nextIdx === -1 || depositIdx === -1 || totalPriceIdx === -1 || termIdx === -1 || startIdx === -1) {
    console.error(
      "Missing required columns (need Stand Number, Deposit, TOTAL PRICE, NUMBER OF INSTALLMENTS, START DATE, Next Payment Column)",
    );
    process.exit(1);
  }

  /** First month column sits immediately **after** START DATE — template column M after L. */
  const m0 = startIdx + 1;
  if (m0 >= nextIdx) {
    console.error("Monthly block missing: START DATE must be immediately left of instalment columns, before Next Payment Column");
    process.exit(1);
  }

  /** @type {{ col: number; dateISO: string }[]} */
  const monthCols = [];
  for (let c = m0; c < nextIdx; c++) {
    const d = parseMonthHeader(header[c]);
    if (!d) {
      console.warn(`WARN: column ${XLSX.utils.encode_col(c)} header not parsed as date, skipping column: "${header[c]}"`);
      continue;
    }
    monthCols.push({ col: c, dateISO: d });
  }

  let okContracts = 0;
  let payOk = 0;
  let paySkippedFuture = 0;
  let skipped = 0;
  let failures = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const standRaw = row[standIdx];
    const standNum = String(standRaw ?? "")
      .trim()
      .replace(/^#/, "");
    const stand = standNum ? standNum.toUpperCase() : "";
    if (!stand || /^totals$/i.test(stand)) continue;

    const category = catIdx !== -1 ? String(row[catIdx] ?? "") : "";
    if (isInternalStand(stand, category)) {
      skipped++;
      continue;
    }

    const first = firstNameIdx !== -1 ? String(row[firstNameIdx] ?? "").trim() : "";
    const last = lastNameIdx !== -1 ? String(row[lastNameIdx] ?? "").trim() : "";
    const name =
      [first, last]
        .filter((x) => x)
        .join(" ")
        .trim() || `Stand ${stand}`;

    const email = emailIdx !== -1 ? cleanEmail(row[emailIdx]) : "";
    const phone = contactIdx !== -1 ? cleanPhone(row[contactIdx]) : "";

    const totalPrice = parseMoney(row[totalPriceIdx]);
    const deposit = parseMoney(row[depositIdx]);
    const termMonths = parseIntSafe(row[termIdx], 36);
    const paymentStart =
      parseStartDate(row[startIdx]) || parseMonthHeader(monthCols[0]?.col != null ? header[monthCols[0].col] : "") || new Date().toISOString().slice(0, 10);

    const sheetTotalPaidAx = axIdx !== -1 ? parseMoney(row[axIdx]) : null;
    const sheetCurBalAy = ayIdx !== -1 ? parseMoney(row[ayIdx]) : null;

    /** Sum installment cells up to cutoff (deposit excluded here). */
    let sumInstallThroughCutoff = 0;
    let sumInstallAllDates = 0;
    /** @type {{ dateISO: string; amount: number; col: number }[]} */
    const cellsToPost = [];
    for (const { col, dateISO } of monthCols) {
      const amt = parseMoney(row[col]);
      if (amt <= 0) continue;
      sumInstallAllDates += amt;
      if (dateISO > asOfISO) continue;
      sumInstallThroughCutoff += amt;
      cellsToPost.push({ dateISO, amount: amt, col });
    }

    const vatIdx = pickColIndex(header, ["Agreement Type (VAT)", "Agreement Type"]);
    const vatType = vatIdx !== -1 ? String(row[vatIdx] ?? "") : "";
    const isVatInclusive = !/exclusive/i.test(vatType);

    const sellerIdx = pickColIndex(header, ["Agreement signed by Warwickshire"]);
    const buyerIdx = pickColIndex(header, ["Agreement signed by client"]);
    const agrUrlIdx = pickColIndex(header, ["Agreement of sale file", "Agreement of sale file "]);
    const agreementSeller = sellerIdx !== -1 ? /^true$/i.test(String(row[sellerIdx] ?? "")) : false;
    const agreementBuyer = buyerIdx !== -1 ? /^true$/i.test(String(row[buyerIdx] ?? "")) : false;
    const agreementUrl = agrUrlIdx !== -1 ? String(row[agrUrlIdx] ?? "").trim() : "";

    if (totalPrice <= 0) {
      console.warn(`SKIP row ${r + 1} stand ${stand}: missing or zero TOTAL PRICE`);
      skipped++;
      continue;
    }

    const impliedCurBalCutoff = totalPrice - deposit - sumInstallThroughCutoff;
    if (sheetCurBalAy != null && sheetCurBalAy > 0) {
      const d = Math.abs(impliedCurBalCutoff - sheetCurBalAy);
      if (d > 2.01) {
        console.warn(
          `WARN row ${r + 1} stand ${stand}: sheet Current Balance (${sheetCurBalAy.toFixed(2)}) vs expected from cut-off (${impliedCurBalCutoff.toFixed(2)}) Δ=${d.toFixed(2)}`,
        );
      }
    }

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
      if (!parseOnly) {
        await odooPost("/lakecity/api/v1/loan/upsert", loanBody);
      }
      okContracts++;

      if (
        sheetTotalPaidAx != null &&
        sheetTotalPaidAx > 0 &&
        Math.abs(deposit + sumInstallAllDates - sheetTotalPaidAx) > 2.01
      ) {
        console.warn(
          `WARN row ${r + 1} stand ${stand}: sheet TOTAL PAID (${sheetTotalPaidAx.toFixed(2)}) ≠ Deposit (${deposit.toFixed(2)}) + SUM(monthlies) (${(deposit + sumInstallAllDates).toFixed(2)})`,
        );
      }

      for (const cell of cellsToPost) {
        const colLetter = XLSX.utils.encode_col(cell.col);
        const ext = `collection-csv-sheetpay-${stand}-${cell.dateISO}-c${cell.col}`;
        const payBody = {
          external_uid: ext,
          contract_external_uid: externalUid,
          amount: cell.amount,
          payment_date: cell.dateISO,
          source: "manual",
          reference: `Collection schedule ${sheetName} (${asOfISO}) col ${colLetter}`,
          state: "posted",
        };

        await sleep(parseOnly ? 0 : 40);
        if (!parseOnly) {
          await odooPost("/lakecity/api/v1/payment/post", payBody);
        }
        payOk++;
      }

      for (const { col, dateISO } of monthCols) {
        const amt = parseMoney(row[col]);
        if (amt > 0 && dateISO > asOfISO) paySkippedFuture++;
      }
    } catch (e) {
      failures++;
      console.error(`FAIL row ${r + 1} stand ${stand}:`, e.message);
    }

    await sleep(parseOnly ? 0 : 60);
  }

  console.log(
    `\nSheet "${sheetName}" | as-of ${asOfISO}: contracts ${okContracts}, payments posted ${payOk}, skipped rows ${skipped}, failures ${failures}`,
  );
  console.log(`(Future-dated instalment amounts after ${asOfISO}: ${paySkippedFuture} cell(s) omitted from postings.)`);

  if (dryRun || parseOnly) console.log("(no HTTP sent)");
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
