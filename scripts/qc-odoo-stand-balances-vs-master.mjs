#!/usr/bin/env node
/**
 * QC: per-stand Odoo client balance vs LakeCity Stand Sales AR (121000),
 * with Master List / Transaction Detail as external check.
 *
 * Match key: stand_number (never partner alone — one partner can own many stands).
 *
 * Stand Sales identification (from addon, not invented):
 *   - Journal: "Lake City Stand Sales" / code STND
 *   - Trade AR: COA 121000
 *   - Moves linked via account.move.lakecity_loan_contract_id
 *   - Client balance: lakecity.loan.contract.current_balance
 *
 * Staging export (preferred):
 *   odoo/addons/lakecity_loan_management/scripts/odoo_sh_export_stand_balances.py
 *   → CSV with odoo_client_balance + stand_sales_balance
 *
 * Usage:
 *   node scripts/qc-odoo-stand-balances-vs-master.mjs --master-xlsx Master.xlsx --sheet-only
 *   node scripts/qc-odoo-stand-balances-vs-master.mjs --master-xlsx Master.xlsx \
 *     --odoo-contracts-csv /tmp/lakecity_stand_balance_export.csv \
 *     --out-dir ./tmp/odoo-balance-qc
 *
 * Does NOT write Production / Staging. Analysis + exceptions list only.
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSXNS from "xlsx";
const XLSX = XLSXNS.default ?? XLSXNS;
import { normStand, parseMoney, parseUkPreferDate } from "./lib/uk-date-parse.mjs";
import {
  classifyStandBalanceException,
  STAND_SALES,
} from "./lib/stand-balance-reconcile.mjs";

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
      odoo_client_balance: parseMoney(
        pick(row, ["odoo_client_balance", "current_balance", "Current Balance", "Balance"]),
      ),
      stand_sales_balance: parseMoney(
        pick(row, [
          "stand_sales_balance",
          "stand_sales_ar",
          "partner_receivable_balance",
          "AR Balance",
          "receivable_balance",
          "121000",
        ]),
      ),
      total_paid: parseMoney(pick(row, ["total_paid", "Total Paid"])),
      total_with_tax: parseMoney(pick(row, ["total_with_tax", "Total With Tax", "total_price"])),
      partner_ar_121000_all_stands: parseMoney(
        pick(row, ["partner_ar_121000_all_stands", "partner_ar_all"]),
      ),
      partner_name: String(pick(row, ["partner_name", "Partner"]) || "").trim(),
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
        stand_number: stand,
        customer_name: m.name,
        odoo_client_balance: "",
        stand_sales_balance: "",
        master_balance: m.balance_remaining,
        difference: Math.round((txn - m.actual_total_paid) * 100) / 100,
        likely_cause: "sheet_internal_paid_vs_txn_sum",
        master_actual_total_paid: m.actual_total_paid,
        txn_detail_sum: txn,
      });
    }
  }

  const summary = {
    stand_sales_identification: { ...STAND_SALES },
    master_stands: master.size,
    txn_stands: txnSum.size,
    sheet_exceptions: sheetExceptions.length,
    mode: sheetOnly ? "sheet_only" : "sheet_vs_odoo",
    note:
      "Match key is stand_number. Stand Sales AR must be attributed via " +
      "account.move.lakecity_loan_contract_id (not partner AR alone). " +
      "Do not invent bank/account numbers.",
  };

  writeCsv(path.join(outDir, "sheet-exceptions.csv"), sheetExceptions);

  if (!sheetOnly) {
    if (!fs.existsSync(odooCsv)) {
      console.error("Missing --odoo-contracts-csv");
      process.exit(2);
    }
    const odoo = loadOdooContracts(odooCsv);
    const exceptions = [];
    const samples = [];

    for (const [stand, m] of master) {
      const o = odoo.get(stand);
      const masterPaid =
        m.actual_total_paid != null
          ? m.actual_total_paid
          : txnSum.has(stand)
            ? Math.round(txnSum.get(stand) * 100) / 100
            : null;

      if (!o) {
        if (m.balance_remaining != null && Math.abs(m.balance_remaining) > tol) {
          exceptions.push({
            stand_number: stand,
            customer_name: m.name,
            odoo_client_balance: "",
            stand_sales_balance: "",
            master_balance: m.balance_remaining,
            difference: "",
            likely_cause: "contract_missing_in_odoo",
          });
        }
        continue;
      }

      const classified = classifyStandBalanceException({
        clientBalance: o.odoo_client_balance,
        standSalesBalance: o.stand_sales_balance,
        masterBalance: m.balance_remaining,
        clientPaid: o.total_paid,
        masterPaid,
        tol,
      });

      if (classified) {
        const row = {
          stand_number: stand,
          customer_name: m.name || o.partner_name,
          odoo_client_balance: classified.odoo_client_balance,
          stand_sales_balance: classified.stand_sales_balance,
          master_balance: classified.master_balance,
          difference: classified.difference,
          likely_cause: classified.likely_cause,
          kind: classified.kind,
          odoo_total_paid: o.total_paid,
          master_paid: masterPaid,
          partner_ar_121000_all_stands: o.partner_ar_121000_all_stands,
        };
        exceptions.push(row);
        if (samples.length < 15) samples.push(row);
      }
    }

    // Odoo contracts with no Master row (informational)
    let orphanOdoo = 0;
    for (const [stand, o] of odoo) {
      if (master.has(stand)) continue;
      orphanOdoo += 1;
      if (
        (o.odoo_client_balance != null && Math.abs(o.odoo_client_balance) > tol) ||
        (o.stand_sales_balance != null && Math.abs(o.stand_sales_balance) > tol)
      ) {
        exceptions.push({
          stand_number: stand,
          customer_name: o.partner_name,
          odoo_client_balance: o.odoo_client_balance,
          stand_sales_balance: o.stand_sales_balance,
          master_balance: "",
          difference: "",
          likely_cause: "odoo_stand_not_on_master_list",
          kind: "odoo_only",
        });
      }
    }

    summary.odoo_contracts = odoo.size;
    summary.exceptions = exceptions.length;
    summary.orphan_odoo_stands = orphanOdoo;
    summary.sample_exceptions = samples;

    writeCsv(path.join(outDir, "exceptions.csv"), exceptions);
    // Back-compat alias
    writeCsv(path.join(outDir, "odoo-balance-exceptions.csv"), exceptions);
  }

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outDir}`);
}

main();
