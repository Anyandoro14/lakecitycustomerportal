#!/usr/bin/env node
/**
 * Fixture-driven smoke test for daily three-way reconcile (no Odoo HTTP).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bnpl-recon-"));

const collectionCsv = path.join(tmp, "collection.csv");
const salesCsv = path.join(tmp, "sales.csv");
const odooJson = path.join(tmp, "odoo.json");
const outDir = path.join(tmp, "out");

fs.writeFileSync(
  collectionCsv,
  [
    "Stand Number,First Name,Last Name,TOTAL PRICE,TOTAL PAID,Current Balance,START DATE",
    "100,Ada,Lovelace,10000,4000,6000,05/01/2025",
    "101,Alan,Turing,20000,5000,14000,15/03/2025",
    // arithmetic error: 8000 paid implies balance 12000 but sheet says 11000
    "102,Grace,Hopper,20000,8000,11000,01/06/2025",
  ].join("\n"),
  "utf8",
);

fs.writeFileSync(
  salesCsv,
  [
    "Stand Number,Customer,Stand Price",
    "100,Ada Lovelace,10000",
    "101,Alan Turing,21000", // price mismatch vs collection
  ].join("\n"),
  "utf8",
);

fs.writeFileSync(
  odooJson,
  JSON.stringify(
    {
      ok: true,
      accounting_start_date: "2026-01-01",
      opening_equity_account_code: "303000",
      default_bank_account_code: "101410",
      contracts: [
        {
          stand_number: "100",
          partner_name: "Ada Lovelace",
          total_with_tax: 10000,
          total_paid: 4000,
          current_balance: 6000,
          payments: [
            {
              name: "LC-PAY-OB",
              external_uid: "opening-balance-100",
              payment_date: "2026-01-01",
              amount: 3500,
              source: "manual",
              is_opening_balance: true,
              receipt_debit_account_codes: ["101410"], // BAD: should be 303000
            },
            {
              name: "LC-PAY-1",
              external_uid: "pay-100-1",
              payment_date: "2026-02-05",
              amount: 500,
              source: "bank_transfer",
              is_opening_balance: false,
              receipt_debit_account_codes: ["101410"],
            },
          ],
        },
        {
          stand_number: "101",
          partner_name: "Alan Turing",
          total_with_tax: 20000,
          total_paid: 4500, // mismatch vs collection 5000
          current_balance: 15500,
          payments: [
            {
              name: "LC-PAY-OB-101",
              external_uid: "opening-balance-101",
              payment_date: "2026-01-01",
              amount: 4500,
              source: "manual",
              is_opening_balance: true,
              receipt_debit_account_codes: ["303000"],
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

const script = path.join(root, "scripts/daily-bnpl-three-way-reconcile.mjs");
const result = spawnSync(
  process.execPath,
  [
    script,
    "--collection",
    collectionCsv,
    "--sales",
    salesCsv,
    "--odoo-json",
    odooJson,
    "--out-dir",
    outDir,
  ],
  { encoding: "utf8" },
);

if (result.status !== 2 && result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  throw new Error(`reconcile exited ${result.status}`);
}

const csv = fs.readdirSync(outDir).find((f) => f.endsWith(".csv"));
if (!csv) throw new Error("missing CSV report");
const body = fs.readFileSync(path.join(outDir, csv), "utf8");

function assertIncludes(substr, msg) {
  if (!body.includes(substr)) throw new Error(`${msg}: missing ${substr}`);
}

assertIncludes("pre_cutoff_hit_bank", "detect bank debit on opening lump");
assertIncludes("stand_price_mismatch", "sales vs collection price");
assertIncludes("amount_mismatch", "paid mismatch stand 101");
assertIncludes("manual_total_error", "sheet arithmetic stand 102");
assertIncludes("ambiguous_date_day_month", "START DATE 05/01 flagged");

console.log("daily-bnpl-three-way-reconcile self-test: ok");
console.log(result.stdout.trim().split("\n").slice(-4).join("\n"));
