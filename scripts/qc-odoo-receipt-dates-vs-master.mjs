#!/usr/bin/env node
/**
 * QC: Master List "Transaction Detail" Receipt Date (source of truth)
 * vs Odoo BNPL payments / account.payment dates — flag US↔UK day/month swaps.
 *
 * Staging-first. Does NOT write to Odoo. Emits a correction QC list CSV.
 *
 * Usage:
 *   node scripts/qc-odoo-receipt-dates-vs-master.mjs \
 *     --master-xlsx /path/to/Warwickshire\ Sales\ Master\ List\ Final.xlsx \
 *     --odoo-payments-csv /path/to/staging-payments.csv
 *
 *   # Sheet-only risk universe (ambiguous dates after cutover):
 *   node scripts/qc-odoo-receipt-dates-vs-master.mjs --master-xlsx ... --sheet-only
 *
 * Odoo payments CSV columns (any case / alias):
 *   stand_number | Stand Number
 *   payment_date | Payment Date | date
 *   amount | Amount
 *   reference | Reference | Receipt Number | name
 *   id | payment_id (optional)
 *   external_uid (optional)
 *
 * Env (optional live Staging read via loan/get — balances only, not payment dates):
 *   ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN
 *
 * Output:
 *   --out-dir (default ./tmp/odoo-date-qc) → summary.json + mismatches.csv + correction-candidates.csv
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSXNS from "xlsx";
const XLSX = XLSXNS.default ?? XLSXNS;
import {
  parseUkPreferDate,
  isDayMonthAmbiguous,
  swapDayMonthIso,
  isoToDdMmYyyy,
  normStand,
  parseMoney,
} from "./lib/uk-date-parse.mjs";

const CUTOFF_DEFAULT = "2026-01-01";

function argVal(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readCsv(filePath) {
  const wb = XLSX.readFile(filePath, { raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
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

function loadMasterTransactionDetail(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const name =
    wb.SheetNames.find((n) => /transaction\s*detail/i.test(n)) ||
    wb.SheetNames.find((n) => /transaction/i.test(n));
  if (!name) throw new Error(`No "Transaction Detail" sheet in ${xlsxPath}`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: true });
  const out = [];
  for (const row of rows) {
    const stand = normStand(pick(row, ["Stand Number", "stand_number", "Stand"]));
    const dateISO = parseUkPreferDate(pick(row, ["Receipt Date", "payment_date", "Payment Date", "Date"]));
    const amount = parseMoney(pick(row, ["Receipt Amount", "amount", "Amount"]));
    if (!stand || !dateISO) continue;
    out.push({
      stand,
      receipt_number: String(pick(row, ["Receipt Number", "reference", "Reference"]) || "").trim(),
      receipt_date_iso: dateISO,
      receipt_date_ddmmyyyy: isoToDdMmYyyy(dateISO),
      amount,
      first_name: String(pick(row, ["First Name"]) || "").trim(),
      surname: String(pick(row, ["Surname", "Last Name"]) || "").trim(),
      category: String(pick(row, ["Category"]) || "").trim(),
      ambiguous: isDayMonthAmbiguous(dateISO),
      swapped_iso: swapDayMonthIso(dateISO),
    });
  }
  return out;
}

function loadOdooPaymentsCsv(csvPath) {
  const rows = readCsv(csvPath);
  return rows
    .map((row) => {
      const stand = normStand(pick(row, ["stand_number", "Stand Number", "Stand"]));
      const dateISO = parseUkPreferDate(
        pick(row, ["payment_date", "Payment Date", "date", "Date", "Receipt Date"]),
      );
      const amount = parseMoney(pick(row, ["amount", "Amount", "payment_amount"]));
      if (!stand || !dateISO) return null;
      return {
        stand,
        payment_date_iso: dateISO,
        amount,
        reference: String(
          pick(row, ["reference", "Reference", "Receipt Number", "name", "Name"]) || "",
        ).trim(),
        id: String(pick(row, ["id", "payment_id", "ID"]) || "").trim(),
        external_uid: String(pick(row, ["external_uid", "External UID"]) || "").trim(),
      };
    })
    .filter(Boolean);
}

function moneyKey(n) {
  if (n == null || !Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Match sheet row → Odoo payment by stand + amount + (exact date OR swapped date).
 */
function reconcile(sheetRows, odooRows, cutoff) {
  const byStand = new Map();
  for (const p of odooRows) {
    if (!byStand.has(p.stand)) byStand.set(p.stand, []);
    byStand.get(p.stand).push({ ...p, _used: false });
  }

  const exact = [];
  const swapped = [];
  const missingInOdoo = [];
  const sheetOnlyAmbiguous = [];

  for (const s of sheetRows) {
    if (s.receipt_date_iso < cutoff) continue;
    if (s.ambiguous) sheetOnlyAmbiguous.push(s);

    const candidates = byStand.get(s.stand) || [];
    const amt = moneyKey(s.amount);
    let hit = candidates.find(
      (p) => !p._used && moneyKey(p.amount) === amt && p.payment_date_iso === s.receipt_date_iso,
    );
    if (hit) {
      hit._used = true;
      exact.push({ sheet: s, odoo: hit, status: "exact_match" });
      continue;
    }

    const swappedIso = s.swapped_iso;
    if (swappedIso) {
      hit = candidates.find(
        (p) => !p._used && moneyKey(p.amount) === amt && p.payment_date_iso === swappedIso,
      );
      if (hit) {
        hit._used = true;
        swapped.push({
          sheet: s,
          odoo: hit,
          status: "likely_day_month_swap",
          sheet_date: s.receipt_date_iso,
          odoo_date: hit.payment_date_iso,
          correct_to: s.receipt_date_iso,
          correct_to_ddmmyyyy: s.receipt_date_ddmmyyyy,
        });
        continue;
      }
    }

    // Same stand+amount different non-swap date
    hit = candidates.find((p) => !p._used && moneyKey(p.amount) === amt);
    if (hit) {
      hit._used = true;
      missingInOdoo.push({
        sheet: s,
        odoo: hit,
        status: "amount_match_date_differs",
        sheet_date: s.receipt_date_iso,
        odoo_date: hit.payment_date_iso,
      });
      continue;
    }

    missingInOdoo.push({
      sheet: s,
      odoo: null,
      status: "no_odoo_match",
      sheet_date: s.receipt_date_iso,
      odoo_date: null,
    });
  }

  const unmatchedOdoo = [];
  for (const [, list] of byStand) {
    for (const p of list) {
      if (!p._used && p.payment_date_iso >= cutoff) unmatchedOdoo.push(p);
    }
  }

  return { exact, swapped, missingInOdoo, sheetOnlyAmbiguous, unmatchedOdoo };
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

function main() {
  const masterXlsx = argVal("--master-xlsx") || process.env.MASTER_XLSX || "";
  const odooCsv = argVal("--odoo-payments-csv") || process.env.ODOO_PAYMENTS_CSV || "";
  const cutoff = argVal("--cutoff", CUTOFF_DEFAULT);
  const outDir = argVal("--out-dir", path.resolve("tmp/odoo-date-qc"));
  const sheetOnly = hasFlag("--sheet-only");

  if (!masterXlsx || !fs.existsSync(masterXlsx)) {
    console.error("Required: --master-xlsx path to Master List workbook (Transaction Detail tab).");
    process.exit(2);
  }
  if (!sheetOnly && (!odooCsv || !fs.existsSync(odooCsv))) {
    console.error(
      "Provide --odoo-payments-csv (Staging export) or use --sheet-only for ambiguous-date universe.",
    );
    process.exit(2);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const sheetRows = loadMasterTransactionDetail(masterXlsx);
  const postCutoff = sheetRows.filter((r) => r.receipt_date_iso >= cutoff);
  const ambiguousPost = postCutoff.filter((r) => r.ambiguous);

  const summary = {
    cutoff,
    master_transaction_detail_rows: sheetRows.length,
    post_cutoff_rows: postCutoff.length,
    ambiguous_post_cutoff_rows: ambiguousPost.length,
    unambiguous_post_cutoff_rows: postCutoff.length - ambiguousPost.length,
    mode: sheetOnly ? "sheet_only" : "sheet_vs_odoo",
    note:
      "Receipt Date on Master List Transaction Detail is source of truth (dd/mm/yyyy / UK). " +
      "Ambiguous = day and month both ≤12 and unequal. Swap detection requires Odoo export.",
  };

  writeCsv(
    path.join(outDir, "ambiguous-post-cutoff.csv"),
    ambiguousPost.map((r) => ({
      stand: r.stand,
      receipt_number: r.receipt_number,
      receipt_date_iso: r.receipt_date_iso,
      receipt_date_ddmmyyyy: r.receipt_date_ddmmyyyy,
      swapped_iso: r.swapped_iso,
      swapped_ddmmyyyy: r.swapped_iso ? isoToDdMmYyyy(r.swapped_iso) : "",
      amount: r.amount,
      name: `${r.first_name} ${r.surname}`.trim(),
      category: r.category,
    })),
  );

  if (sheetOnly) {
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Wrote ${path.join(outDir, "ambiguous-post-cutoff.csv")}`);
    return;
  }

  const odooRows = loadOdooPaymentsCsv(odooCsv);
  const result = reconcile(sheetRows, odooRows, cutoff);

  summary.odoo_payment_rows = odooRows.length;
  summary.exact_matches = result.exact.length;
  summary.likely_day_month_swaps = result.swapped.length;
  summary.amount_match_date_differs_or_missing = result.missingInOdoo.length;
  summary.unmatched_odoo_post_cutoff = result.unmatchedOdoo.length;

  const correction = result.swapped.map((x) => ({
    stand: x.sheet.stand,
    receipt_number: x.sheet.receipt_number,
    amount: x.sheet.amount,
    sheet_receipt_date_iso: x.sheet_date,
    sheet_receipt_date_ddmmyyyy: x.sheet.receipt_date_ddmmyyyy,
    odoo_payment_date_iso: x.odoo_date,
    odoo_payment_date_ddmmyyyy: isoToDdMmYyyy(x.odoo_date),
    correct_odoo_to_iso: x.correct_to,
    correct_odoo_to_ddmmyyyy: x.correct_to_ddmmyyyy,
    odoo_payment_id: x.odoo.id,
    odoo_reference: x.odoo.reference,
    odoo_external_uid: x.odoo.external_uid,
    action: "set_payment_date_to_sheet_on_staging",
  }));

  writeCsv(path.join(outDir, "correction-candidates.csv"), correction);
  writeCsv(
    path.join(outDir, "mismatches.csv"),
    [
      ...result.swapped.map((x) => ({
        status: x.status,
        stand: x.sheet.stand,
        amount: x.sheet.amount,
        sheet_date: x.sheet_date,
        odoo_date: x.odoo_date,
        odoo_id: x.odoo?.id || "",
      })),
      ...result.missingInOdoo.map((x) => ({
        status: x.status,
        stand: x.sheet.stand,
        amount: x.sheet.amount,
        sheet_date: x.sheet_date,
        odoo_date: x.odoo_date || "",
        odoo_id: x.odoo?.id || "",
      })),
    ],
  );

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Correction candidates (likely swaps): ${correction.length}`);
  console.log(`Wrote ${outDir}`);
}

main();
