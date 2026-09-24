#!/usr/bin/env node
/**
 * Daily three-way BNPL reconciliation:
 *   Sales Master  ↔  Collection Schedule  ↔  Odoo
 *
 * Inputs (paths or env — no Google Sheet IDs invented):
 *   --collection PATH   Collection Schedule CSV/XLSX (or COLLECTION_CSV_PATH / COLLECTION_XLSX_PATH)
 *   --sales PATH        Sales Master CSV/XLSX (or SALES_MASTER_PATH) — optional
 *   --odoo              Fetch Odoo via GET /lakecity/api/v1/loan/reconcile-export
 *                       (needs ODOO_ORIGIN + LAKECITY_LOAN_API_TOKEN)
 *   --odoo-json PATH    Use a saved Odoo reconcile-export JSON instead of live API
 *   --cutoff YYYY-MM-DD Accounting start (default 2026-01-01 / LAKECITY_ACCOUNTING_START_DATE)
 *   --out-dir PATH      Report directory (default docs/output/reconcile)
 *   --stand N           Limit to one stand
 *
 *   --push-queue        POST issues to Odoo Daily Reconciliation ingest API
 *                       (needs ODOO_ORIGIN + LAKECITY_LOAN_API_TOKEN; addon daily_reconciliation)
 *
 * Outputs:
 *   bnpl-reconcile-YYYY-MM-DD.csv
 *   bnpl-reconcile-YYYY-MM-DD.md
 *   bnpl-reconcile-YYYY-MM-DD.json  (for Daily Reconciliation import / --push-queue)
 *
 * Required Collection columns (case-insensitive): Stand Number, TOTAL PRICE,
 * TOTAL PAID, Current Balance (or Accounts Receivable). Month-grid payment cells optional.
 *
 * Required Sales Master columns (when provided): Stand Number, stand price
 * (TOTAL PRICE / Sale Price / Stand Price), customer name optional.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parse as parseCsv } from "csv-parse/sync";
import {
  ACCOUNT_CODES,
  isPreAccountingStart,
  looksLikeDayMonthSwap,
  normStand,
  parseSheetDate,
  resolveAccountingStartDate,
  selectReceiptDebitAccount,
} from "./lib/accounting-cutoff.mjs";

const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
function flagVal(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? String(argv[i + 1] || "").trim() : "";
}
function hasFlag(name) {
  return argv.includes(name);
}

const cutoffDate = resolveAccountingStartDate(
  flagVal("--cutoff") || process.env.LAKECITY_ACCOUNTING_START_DATE,
);
const standFilter = flagVal("--stand");
const outDir =
  flagVal("--out-dir") ||
  process.env.RECONCILE_OUT_DIR ||
  path.join("docs", "output", "reconcile");
const collectionPath =
  flagVal("--collection") ||
  process.env.COLLECTION_CSV_PATH ||
  process.env.COLLECTION_XLSX_PATH ||
  "";
const salesPath = flagVal("--sales") || process.env.SALES_MASTER_PATH || "";
const odooJsonPath = flagVal("--odoo-json") || "";
const fetchOdoo = hasFlag("--odoo") || Boolean(process.env.ODOO_ORIGIN && !odooJsonPath);
const pushQueue = hasFlag("--push-queue");
const moneyTol = Number(process.env.RECONCILE_MONEY_TOLERANCE || "1"); // USD

const SEVERITY = { critical: 1, high: 2, medium: 3, low: 4 };

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

function nearlyEqual(a, b, tol = moneyTol) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
}

function readTable(filePath) {
  if (!filePath) return [];
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const text = fs.readFileSync(filePath, "utf8");
    const rows = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });
    return rows.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) out[normHeader(k)] = v;
      return out;
    });
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    let XLSX;
    try {
      XLSX = require("xlsx");
    } catch (e) {
      throw new Error(
        `XLSX support needs the 'xlsx' package (or export CSV). ${e.message}`,
      );
    }
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    return json.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) out[normHeader(k)] = v;
      return out;
    });
  }
  throw new Error(`Unsupported file type: ${filePath} (use .csv or .xlsx)`);
}

function pick(row, names) {
  for (const n of names) {
    const k = normHeader(n);
    if (row[k] !== undefined && String(row[k]).trim() !== "") return row[k];
  }
  return "";
}

function loadCollection(filePath) {
  const rows = readTable(filePath);
  /** @type {Map<string, object>} */
  const byStand = new Map();
  const dateFlags = [];
  for (const row of rows) {
    const stand = normStand(pick(row, ["Stand Number", "Stand", "Stand No", "Stand #"]));
    if (!stand) continue;
    if (standFilter && stand !== normStand(standFilter)) continue;

    const startRaw = pick(row, ["START DATE", "Start Date", "Payment Start"]);
    const startParsed = startRaw ? parseSheetDate(startRaw) : { iso: null, unparseable: false };
    if (startRaw && (startParsed.unparseable || startParsed.dayMonthSwapSuspicion)) {
      dateFlags.push({
        stand,
        field: "START DATE",
        raw: String(startRaw),
        iso: startParsed.iso,
        usAltIso: startParsed.usAltIso,
        dayMonthSwapSuspicion: startParsed.dayMonthSwapSuspicion,
        unparseable: startParsed.unparseable,
      });
    }

    const totalPrice = parseMoney(
      pick(row, ["TOTAL PRICE", "Total Price", "Stand Price", "Sale Price"]),
    );
    const totalPaid = parseMoney(pick(row, ["TOTAL PAID", "Total Paid", "Amount Paid"]));
    const balance = parseMoney(
      pick(row, ["Current Balance", "Accounts Receivable", "Balance", "AR"]),
    );
    const customer = String(
      pick(row, ["Customer", "Customer Name", "Full Name"]) ||
        `${pick(row, ["First Name"])} ${pick(row, ["Last Name"])}`.trim(),
    ).trim();

    // Month-grid cells: any column that parses as a date header with a money value
    const monthPayments = [];
    for (const [col, val] of Object.entries(row)) {
      const headerDate = parseSheetDate(col);
      if (!headerDate.ok) continue;
      const amt = parseMoney(val);
      if (amt === 0) continue;
      monthPayments.push({
        date: headerDate.iso,
        amount: amt,
        ambiguous: headerDate.dayMonthSwapSuspicion,
        rawHeader: col,
      });
      if (headerDate.dayMonthSwapSuspicion || headerDate.unparseable) {
        dateFlags.push({
          stand,
          field: `month:${col}`,
          raw: col,
          iso: headerDate.iso,
          usAltIso: headerDate.usAltIso,
          dayMonthSwapSuspicion: headerDate.dayMonthSwapSuspicion,
          unparseable: headerDate.unparseable,
        });
      }
    }

    const prePaid = monthPayments
      .filter((p) => isPreAccountingStart(p.date, cutoffDate))
      .reduce((s, p) => s + p.amount, 0);
    const postPaid = monthPayments
      .filter((p) => p.date && !isPreAccountingStart(p.date, cutoffDate))
      .reduce((s, p) => s + p.amount, 0);

    byStand.set(stand, {
      stand,
      customer,
      totalPrice,
      totalPaid,
      balance,
      startDate: startParsed.iso,
      monthPayments,
      prePaid,
      postPaid,
      source: "collection",
    });
  }
  return { byStand, dateFlags };
}

function loadSales(filePath) {
  if (!filePath) return new Map();
  const rows = readTable(filePath);
  const byStand = new Map();
  for (const row of rows) {
    const stand = normStand(pick(row, ["Stand Number", "Stand", "Stand No", "Stand #"]));
    if (!stand) continue;
    if (standFilter && stand !== normStand(standFilter)) continue;
    const price = parseMoney(
      pick(row, ["TOTAL PRICE", "Stand Price", "Sale Price", "Price", "Gross Price"]),
    );
    const customer = String(
      pick(row, ["Customer", "Customer Name", "Client", "Full Name"]) ||
        `${pick(row, ["First Name"])} ${pick(row, ["Last Name"])}`.trim(),
    ).trim();
    byStand.set(stand, { stand, customer, totalPrice: price, source: "sales_master" });
  }
  return byStand;
}

async function loadOdoo() {
  if (odooJsonPath) {
    const raw = JSON.parse(fs.readFileSync(odooJsonPath, "utf8"));
    return normalizeOdooExport(raw);
  }
  if (!fetchOdoo) return { byStand: new Map(), meta: {} };
  const origin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
  const token = process.env.LAKECITY_LOAN_API_TOKEN || "";
  if (!origin || !token) {
    throw new Error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN for --odoo");
  }
  const qs = standFilter ? `?stand_number=${encodeURIComponent(standFilter)}` : "";
  const res = await fetch(`${origin}/lakecity/api/v1/loan/reconcile-export${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Odoo non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || json.ok === false) {
    throw new Error(`Odoo reconcile-export failed: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return normalizeOdooExport(json);
}

function normalizeOdooExport(json) {
  const byStand = new Map();
  for (const c of json.contracts || []) {
    const stand = normStand(c.stand_number);
    if (!stand) continue;
    if (standFilter && stand !== normStand(standFilter)) continue;
    byStand.set(stand, {
      stand,
      customer: c.partner_name || "",
      totalPrice: Number(c.total_with_tax || c.total_price) || 0,
      totalPaid: Number(c.total_paid) || 0,
      balance: Number(c.current_balance) || 0,
      payments: c.payments || [],
      source: "odoo",
    });
  }
  return {
    byStand,
    meta: {
      accounting_start_date: json.accounting_start_date || cutoffDate,
      opening_equity_account_code: json.opening_equity_account_code || ACCOUNT_CODES.retained_earnings,
      default_bank_account_code: json.default_bank_account_code || ACCOUNT_CODES.bank_cabs_usd_main,
    },
  };
}

function addIssue(issues, row) {
  issues.push({
    severity: row.severity || "medium",
    stand: row.stand || "",
    field: row.field || "",
    issue: row.issue || "",
    source_a: row.source_a || "",
    value_a: row.value_a ?? "",
    source_b: row.source_b || "",
    value_b: row.value_b ?? "",
    source_c: row.source_c || "",
    value_c: row.value_c ?? "",
    hint: row.hint || "",
  });
}

function reconcile(collection, sales, odoo) {
  const issues = [];
  const stands = new Set([
    ...collection.byStand.keys(),
    ...sales.keys(),
    ...odoo.byStand.keys(),
  ]);

  for (const flag of collection.dateFlags) {
    addIssue(issues, {
      severity: flag.unparseable ? "high" : "medium",
      stand: flag.stand,
      field: flag.field,
      issue: flag.unparseable ? "unparseable_date" : "ambiguous_date_day_month",
      source_a: "collection",
      value_a: flag.raw,
      source_b: "parsed_ddMM",
      value_b: flag.iso || "",
      source_c: "us_alt_mmdd",
      value_c: flag.usAltIso || "",
      hint: "Prefer dd/MM/yyyy (en-GB). Confirm with customer receipt.",
    });
  }

  const equityCode = odoo.meta.opening_equity_account_code || ACCOUNT_CODES.retained_earnings;
  const bankCode = odoo.meta.default_bank_account_code || ACCOUNT_CODES.bank_cabs_usd_main;

  for (const stand of [...stands].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))) {
    const col = collection.byStand.get(stand);
    const sale = sales.get(stand);
    const od = odoo.byStand.get(stand);

    if (col && sale && !nearlyEqual(col.totalPrice, sale.totalPrice)) {
      addIssue(issues, {
        severity: "high",
        stand,
        field: "stand_price",
        issue: "stand_price_mismatch",
        source_a: "collection",
        value_a: col.totalPrice,
        source_b: "sales_master",
        value_b: sale.totalPrice,
        source_c: od ? "odoo" : "",
        value_c: od ? od.totalPrice : "",
        hint: "Align TOTAL PRICE across Sales Master and Collection Schedule, then re-post JE1.",
      });
    }

    if (col && od && !nearlyEqual(col.totalPrice, od.totalPrice)) {
      addIssue(issues, {
        severity: "high",
        stand,
        field: "stand_price",
        issue: "stand_price_mismatch",
        source_a: "collection",
        value_a: col.totalPrice,
        source_b: "odoo",
        value_b: od.totalPrice,
        hint: "Update Odoo contract total_with_tax / re-run opening-balance post.",
      });
    }

    if (col && od && !nearlyEqual(col.totalPaid, od.totalPaid)) {
      addIssue(issues, {
        severity: "critical",
        stand,
        field: "total_paid",
        issue: "amount_mismatch",
        source_a: "collection",
        value_a: col.totalPaid,
        source_b: "odoo",
        value_b: od.totalPaid,
        hint: "Missing receipt, unposted payment, or manual total error on sheet.",
      });
    }

    if (col && od && !nearlyEqual(col.balance, od.balance)) {
      addIssue(issues, {
        severity: "high",
        stand,
        field: "current_balance",
        issue: "balance_mismatch",
        source_a: "collection",
        value_a: col.balance,
        source_b: "odoo",
        value_b: od.balance,
        hint: "Sheet is balance SoT — investigate payment allocation / opening lump.",
      });
    }

    if (col && !od) {
      addIssue(issues, {
        severity: "high",
        stand,
        field: "contract",
        issue: "missing_in_odoo",
        source_a: "collection",
        value_a: col.customer || stand,
        hint: "Create/upsert loan contract from Collection Schedule import.",
      });
    }

    if (od && !col && collection.byStand.size) {
      addIssue(issues, {
        severity: "medium",
        stand,
        field: "contract",
        issue: "missing_in_collection",
        source_a: "odoo",
        value_a: od.customer || stand,
        hint: "Confirm stand still active on Collection Schedule.",
      });
    }

    if (sale && !col && collection.byStand.size) {
      addIssue(issues, {
        severity: "medium",
        stand,
        field: "contract",
        issue: "missing_in_collection",
        source_a: "sales_master",
        value_a: sale.customer || stand,
      });
    }

    // Arithmetic check on collection row
    if (col && col.totalPrice > 0) {
      const implied = Math.round((col.totalPrice - col.totalPaid) * 100) / 100;
      if (!nearlyEqual(implied, col.balance)) {
        addIssue(issues, {
          severity: "high",
          stand,
          field: "sheet_arithmetic",
          issue: "manual_total_error",
          source_a: "collection TOTAL PRICE - TOTAL PAID",
          value_a: implied,
          source_b: "collection Current Balance",
          value_b: col.balance,
          hint: "Fix sheet formulas before trusting import.",
        });
      }
    }

    // Odoo payment-level checks
    if (od) {
      for (const pay of od.payments || []) {
        const codes = pay.receipt_debit_account_codes || [];
        const expected = selectReceiptDebitAccount(pay.payment_date, {
          startDate: cutoffDate,
          source: pay.source,
          isOpeningBalanceLump: pay.is_opening_balance,
          retainedEarningsCode: equityCode,
          defaultBankCode: bankCode,
        });

        if (pay.is_opening_balance || isPreAccountingStart(pay.payment_date, cutoffDate)) {
          const hitBank = codes.some((c) => String(c).startsWith("1014"));
          const hitEquity = codes.some(
            (c) => c === equityCode || c === ACCOUNT_CODES.retained_earnings || c === ACCOUNT_CODES.opening_balance_equity,
          );
          if (hitBank && !hitEquity) {
            addIssue(issues, {
              severity: "critical",
              stand,
              field: "receipt_debit_account",
              issue: "pre_cutoff_hit_bank",
              source_a: "odoo_payment",
              value_a: `${pay.name} ${pay.payment_date} ${pay.amount}`,
              source_b: "debit_accounts",
              value_b: codes.join("|"),
              source_c: "expected",
              value_c: expected.accountCode,
              hint: "Re-run cutover with force after upgrading to 19.0.1.0.69+ so opening cash hits Retained Earnings.",
            });
          }
        } else if (codes.length && !codes.includes(expected.accountCode)) {
          // Soft: live receipt not on expected default bank (may be intentional wallet journal)
          addIssue(issues, {
            severity: "low",
            stand,
            field: "receipt_debit_account",
            issue: "liquidity_account_unexpected",
            source_a: "odoo_payment",
            value_a: `${pay.name} source=${pay.source}`,
            source_b: "debit_accounts",
            value_b: codes.join("|"),
            source_c: "mapped_default",
            value_c: expected.accountCode,
            hint: "Check company cash/EcoCash/Kuva journal mapping if this is wrong.",
          });
        }

        // Date swap suspicion vs collection month payments
        if (col && pay.payment_date) {
          for (const mp of col.monthPayments || []) {
            if (
              nearlyEqual(mp.amount, pay.amount) &&
              looksLikeDayMonthSwap(mp.date, pay.payment_date)
            ) {
              addIssue(issues, {
                severity: "high",
                stand,
                field: "payment_date",
                issue: "wrong_date_day_month_swap",
                source_a: "collection",
                value_a: mp.date,
                source_b: "odoo",
                value_b: pay.payment_date,
                source_c: "amount",
                value_c: pay.amount,
                hint: "Day/month likely swapped — confirm receipt and re-post with dd/MM date.",
              });
            }
          }
        }
      }

      // Missing post-cutoff collection receipts in Odoo
      if (col) {
        for (const mp of col.monthPayments || []) {
          if (!mp.date || isPreAccountingStart(mp.date, cutoffDate)) continue;
          const match = (od.payments || []).find(
            (p) =>
              !p.is_opening_balance &&
              p.payment_date === mp.date &&
              nearlyEqual(p.amount, mp.amount),
          );
          if (!match) {
            // Also try amount-only match (date may differ)
            const amtOnly = (od.payments || []).find(
              (p) => !p.is_opening_balance && nearlyEqual(p.amount, mp.amount),
            );
            if (!amtOnly) {
              addIssue(issues, {
                severity: "critical",
                stand,
                field: "payment",
                issue: "missing_receipt_unposted",
                source_a: "collection",
                value_a: `${mp.date} ${mp.amount}`,
                source_b: "odoo",
                value_b: "not found",
                hint: "Import with scripts/import-post-cutoff-sheet-payments.mjs or post via receipt intake.",
              });
            }
          }
        }
      }
    }
  }

  issues.sort(
    (a, b) =>
      (SEVERITY[a.severity] || 9) - (SEVERITY[b.severity] || 9) ||
      String(a.stand).localeCompare(String(b.stand), undefined, { numeric: true }),
  );
  return issues;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeReports(issues) {
  fs.mkdirSync(outDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const base = `bnpl-reconcile-${day}`;
  const csvPath = path.join(outDir, `${base}.csv`);
  const mdPath = path.join(outDir, `${base}.md`);
  const jsonPath = path.join(outDir, `${base}.json`);

  const headers = [
    "severity",
    "stand",
    "field",
    "issue",
    "source_a",
    "value_a",
    "source_b",
    "value_b",
    "source_c",
    "value_c",
    "hint",
  ];
  const lines = [headers.join(",")];
  for (const row of issues) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(csvPath, lines.join("\n") + "\n", "utf8");

  const counts = {};
  for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
  const md = [
    `# BNPL three-way reconcile — ${day}`,
    "",
    `- Accounting start: **${cutoffDate}**`,
    `- Issues: **${issues.length}** (critical ${counts.critical || 0}, high ${counts.high || 0}, medium ${counts.medium || 0}, low ${counts.low || 0})`,
    `- Collection: \`${collectionPath || "(none)"}\``,
    `- Sales Master: \`${salesPath || "(none)"}\``,
    `- Odoo: ${odooJsonPath ? odooJsonPath : fetchOdoo ? "live API" : "(none)"}`,
    "",
    "## Discrepancies",
    "",
  ];
  if (!issues.length) {
    md.push("_No discrepancies at current tolerance._", "");
  } else {
    md.push(
      "| Severity | Stand | Field | Issue | A | B | C | Hint |",
      "|---|---|---|---|---|---|---|---|",
    );
    for (const row of issues.slice(0, 500)) {
      md.push(
        `| ${row.severity} | ${row.stand} | ${row.field} | ${row.issue} | ${csvEscape(row.value_a)} (${row.source_a}) | ${csvEscape(row.value_b)} (${row.source_b}) | ${csvEscape(row.value_c)} (${row.source_c}) | ${row.hint} |`,
      );
    }
    if (issues.length > 500) md.push("", `_… ${issues.length - 500} more rows in CSV_`, "");
  }
  md.push("", `CSV: \`${csvPath}\``, `JSON: \`${jsonPath}\``, "");
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  const jsonPayload = {
    reconcile_date: day,
    accounting_start_date: cutoffDate,
    issues,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2) + "\n", "utf8");
  return { csvPath, mdPath, jsonPath, day, counts };
}

async function pushIssuesToQueue(issues, reconcileDate) {
  const origin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
  const token = process.env.LAKECITY_LOAN_API_TOKEN || "";
  if (!origin || !token) {
    throw new Error("--push-queue needs ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN");
  }
  const url = `${origin}/lakecity/api/v1/daily-reconciliation/ingest`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reconcile_date: reconcileDate, issues }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Queue ingest failed HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

async function main() {
  if (!collectionPath && !salesPath && !fetchOdoo && !odooJsonPath) {
    console.error(
      "Provide at least --collection and/or --sales and/or --odoo / --odoo-json.\n" +
        "See docs/bnpl-accounting-cutover-and-daily-reconcile.md",
    );
    process.exit(1);
  }

  console.log(`Accounting start: ${cutoffDate}`);
  const collection = collectionPath
    ? loadCollection(collectionPath)
    : { byStand: new Map(), dateFlags: [] };
  const sales = loadSales(salesPath);
  const odoo = await loadOdoo();

  console.log(
    `Loaded stands — collection ${collection.byStand.size}, sales ${sales.size}, odoo ${odoo.byStand.size}`,
  );

  const issues = reconcile(collection, sales, odoo);
  const { csvPath, mdPath, jsonPath, day, counts } = writeReports(issues);

  console.log(
    `Issues: ${issues.length} (critical ${counts.critical || 0}, high ${counts.high || 0}, medium ${counts.medium || 0}, low ${counts.low || 0})`,
  );
  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);

  if (pushQueue) {
    const result = await pushIssuesToQueue(issues, day);
    console.log(
      `Pushed to Daily Reconciliation queue: created ${result?.stats?.created ?? "?"}, updated ${result?.stats?.updated ?? "?"}, open ${result?.open_count ?? "?"}, all_clear=${result?.all_clear}`,
    );
  }

  process.exit(counts.critical ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
