#!/usr/bin/env node
/**
 * QC: per-stand client balance vs Master List (and optional Odoo exports).
 *
 * Match key: stand_number.
 *
 * External check (always available from Master List xlsx):
 *   - Master List "Balance Remaining" / "Actual Total Paid"
 *   - Sum of Transaction Detail "Receipt Amount" per stand
 *
 * Odoo Stand Sales accounting (from addon):
 *   - Journal: "Lake City Stand Sales" (code STND)
 *   - Trade AR: account code 121000 ("Account Receivable")
 *   - Contract field: lakecity.loan.contract.current_balance
 *     (= total_with_tax - total_paid, floored at 0)
 *
 * Usage:
 *   node scripts/qc-odoo-stand-balances-vs-master.mjs --master-xlsx ... --sheet-only
 *   node scripts/qc-odoo-stand-balances-vs-master.mjs --master-xlsx ... \
 *     --odoo-contracts-csv staging-contracts.csv
 *
 * Odoo contracts CSV columns:
 *   stand_number, current_balance, total_paid, total_with_tax
 *   (optional) partner_receivable_balance  — partner AR residual on 121000
 *
 * Does NOT invent bank/account numbers. Staging analysis only (no writes).
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSXNS from "xlsx";
const XLSX = XLSXNS.default ?? XLSXNS;
import { normStand, parseMoney, parseUkPreferDate } from "./lib/uk-date-parse.mjs";

function argVal(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function pick(row, names) {
  const keys = Object.keys(row);
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const n of names) {
    const k = map.get(norm(n));
    if (k != null && row[k] !== "" && row[k] != null) return row[k];
  }
  return "";
}

function writeCsv(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, "");
    return;
  }
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

function loadMaster(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const masterName =
    wb.SheetNames.find((n) => /^master\s*list$/i.test(n)) || wb.SheetNames[0];
  const txnName =
    wb.SheetNames.find((n) => /transaction\s*detail/i.test(n)) ||
    wb.SheetNames.find((n) => /transaction/i.test(n));

  const masterRows = XLSX.utils.sheet_to_json(wb.Sheets[masterName], { defval: "", raw: true });
  const master = new Map();
  for (const row of masterRows) {
    const stand = normStand(pick(row, ["Stand Number", "stand_number"]));
    if (!stand) continue;
    master.set(stand, {
      stand,
      name: `${pick(row, ["First Name"])} ${pick(row, ["Surname", "Last Name"])}`.trim(),
      purchase_price: parseMoney(pick(row, ["Purchase Price", "TOTAL PRICE", "Total Price"])),
      actual_total_paid: parseMoney(pick(row, ["Actual Total Paid", "Total Paid"])),
      balance_remaining: parseMoney(pick(row, ["Balance Remaining", "Current Balance", "Balance"])),
      arrears: parseMoney(pick(row, ["Arrears"])),
      last_payment: parseUkPreferDate(pick(row, ["Date of Last Payment"])),
    });
  }

  const txnSum = new Map();
  if (txnName) {
    const txnRows = XLSX.utils.sheet_to_json(wb.Sheets[txnName], { defval: "", raw: true });
    for (const row of txnRows) {
      const stand = normStand(pick(row, ["Stand Number"]));
      const amt = parseMoney(pick(row, ["Receipt Amount", "Amount"]));
      if (!stand || amt == null) continue;
      txnSum.set(stand, (txnSum.get(stand) || 0) + amt);
    }
  }

  return { master, txnSum };
}

function loadOdooContracts(csvPath) {
  const wb = XLSX.readFile(csvPath, { raw: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const out = new Map();
  for (const row of rows) {
    const stand = normStand(pick(row, ["stand_number", "Stand Number", "Stand"]));
    if (!stand) continue;
    out.set(stand, {
      stand,
      current_balance: parseMoney(pick(row, ["current_balance", "Current Balance", "Balance"])),
      total_paid: parseMoney(pick(row, ["total_paid", "Total Paid"])),
      total_with_tax: parseMoney(pick(row, ["total_with_tax", "Total With Tax", "total_price"])),
      partner_receivable_balance: parseMoney(
        pick(row, ["partner_receivable_balance", "AR Balance", "receivable_balance", "121000"]),
      ),
    });
  }
  return out;
}

function nearly(a, b, tol = 0.05) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

function main() {
  const masterXlsx = argVal("--master-xlsx") || process.env.MASTER_XLSX || "";
  const odooCsv = argVal("--odoo-contracts-csv") || "";
  const outDir = argVal("--out-dir", path.resolve("tmp/odoo-balance-qc"));
  const sheetOnly = hasFlag("--sheet-only") || !odooCsv;
  const tol = Number(argVal("--tol", "1.00")) || 1;

  if (!masterXlsx || !fs.existsSync(masterXlsx)) {
    console.error("Required: --master-xlsx");
    process.exit(2);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const { master, txnSum } = loadMaster(masterXlsx);

  const sheetExceptions = [];
  for (const [stand, m] of master) {
    const txn = txnSum.has(stand) ? Math.round(txnSum.get(stand) * 100) / 100 : null;
    if (m.actual_total_paid != null && txn != null && !nearly(m.actual_total_paid, txn, 0.02)) {
      sheetExceptions.push({
        stand,
        name: m.name,
        kind: "master_paid_vs_txn_sum",
        master_actual_total_paid: m.actual_total_paid,
        txn_detail_sum: txn,
        difference: Math.round((txn - m.actual_total_paid) * 100) / 100,
        likely_cause: "sheet_internal_inconsistency",
      });
    }
    if (
      m.purchase_price != null &&
      m.actual_total_paid != null &&
      m.balance_remaining != null &&
      !nearly(m.purchase_price - m.actual_total_paid, m.balance_remaining, tol)
    ) {
      sheetExceptions.push({
        stand,
        name: m.name,
        kind: "purchase_minus_paid_vs_balance",
        purchase_price: m.purchase_price,
        master_actual_total_paid: m.actual_total_paid,
        master_balance_remaining: m.balance_remaining,
        purchase_minus_paid: Math.round((m.purchase_price - m.actual_total_paid) * 100) / 100,
        difference:
          Math.round((m.balance_remaining - (m.purchase_price - m.actual_total_paid)) * 100) / 100,
        likely_cause: "vat_or_price_field_mismatch_or_credits",
      });
    }
  }

  const summary = {
    master_stands: master.size,
    txn_stands: txnSum.size,
    sheet_exceptions: sheetExceptions.length,
    stand_sales_identification: {
      journal_name: "Lake City Stand Sales",
      journal_code: "STND",
      trade_receivable_account_code: "121000",
      contract_balance_field: "lakecity.loan.contract.current_balance",
      match_key: "stand_number",
      note:
        "Do not invent bank account numbers. Liquidity COA codes (101410+) are for deposited-to mapping, not client AR.",
    },
    mode: sheetOnly ? "sheet_only" : "sheet_vs_odoo",
  };

  writeCsv(path.join(outDir, "sheet-exceptions.csv"), sheetExceptions);

  if (!sheetOnly) {
    if (!fs.existsSync(odooCsv)) {
      console.error("Missing --odoo-contracts-csv");
      process.exit(2);
    }
    const odoo = loadOdooContracts(odooCsv);
    const odooExceptions = [];
    for (const [stand, m] of master) {
      const o = odoo.get(stand);
      if (!o) {
        if (m.balance_remaining != null && m.balance_remaining > 0) {
          odooExceptions.push({
            stand,
            name: m.name,
            kind: "missing_in_odoo",
            master_balance: m.balance_remaining,
            odoo_current_balance: "",
            difference: "",
            likely_cause: "contract_not_imported_or_stand_mismatch",
          });
        }
        continue;
      }
      if (
        m.balance_remaining != null &&
        o.current_balance != null &&
        !nearly(m.balance_remaining, o.current_balance, tol)
      ) {
        const diff = Math.round((o.current_balance - m.balance_remaining) * 100) / 100;
        let cause = "balance_mismatch";
        if (m.actual_total_paid != null && o.total_paid != null && !nearly(m.actual_total_paid, o.total_paid, tol)) {
          cause = "paid_total_mismatch_check_date_swaps_or_missing_receipts";
        }
        odooExceptions.push({
          stand,
          name: m.name,
          kind: "client_balance_vs_master",
          master_balance: m.balance_remaining,
          odoo_current_balance: o.current_balance,
          master_paid: m.actual_total_paid,
          odoo_total_paid: o.total_paid,
          partner_receivable_121000: o.partner_receivable_balance,
          difference: diff,
          likely_cause: cause,
        });
      }
      if (
        o.partner_receivable_balance != null &&
        o.current_balance != null &&
        !nearly(o.partner_receivable_balance, o.current_balance, tol)
      ) {
        odooExceptions.push({
          stand,
          name: m.name,
          kind: "odoo_ar_121000_vs_contract_balance",
          odoo_current_balance: o.current_balance,
          partner_receivable_121000: o.partner_receivable_balance,
          difference: Math.round((o.partner_receivable_balance - o.current_balance) * 100) / 100,
          likely_cause: "stand_sales_je_vs_bnpl_schedule_drift",
        });
      }
    }
    summary.odoo_contracts = odoo.size;
    summary.odoo_exceptions = odooExceptions.length;
    writeCsv(path.join(outDir, "odoo-balance-exceptions.csv"), odooExceptions);
  }

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outDir}`);
}

main();
