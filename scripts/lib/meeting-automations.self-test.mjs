#!/usr/bin/env node
/**
 * Self-test: meeting automation contracts (commission rate math, CSV template headers,
 * deposited-to + three-way still present).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPOSITED_TO_LABELS, resolveDepositedToLiquidity } from "./deposited-to-liquidity.mjs";
import { threeWayStandCheck } from "./bank-stand-reconcile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Commission math (mirrors Odoo float_round percent of payment)
function commissionAmount(payment, ratePercent) {
  return Math.round(payment * (ratePercent / 100) * 100) / 100;
}
assert(commissionAmount(1000, 5) === 50, "Mshambadzi 5% of 1000");
assert(commissionAmount(250, 5) === 12.5, "5% of 250");

// CSV template headers for customer bank list
const customerBankPy = fs.readFileSync(
  path.join(root, "odoo/addons/lakecity_loan_management/models/customer_bank_account.py"),
  "utf8",
);
assert(customerBankPy.includes("partner_name"), "CSV template partner_name");
assert(customerBankPy.includes("account_code"), "CSV template account_code");
assert(customerBankPy.includes("stand_number"), "CSV template stand_number");

// Models exist
for (const rel of [
  "models/special_client_map.py",
  "models/commission_rule.py",
  "models/stand_reassignment.py",
  "models/daily_exception.py",
  "models/customer_bank_account.py",
  "models/deposited_to_liquidity.py",
  "models/bank_reconcile_discrepancy.py",
]) {
  assert(
    fs.existsSync(path.join(root, "odoo/addons/lakecity_loan_management", rel)),
    `missing ${rel}`,
  );
}

assert(DEPOSITED_TO_LABELS.includes("Cabs Zig"), "Cabs Zig label");
assert(resolveDepositedToLiquidity("Ecocash").code === "101417", "Ecocash map");
assert(
  threeWayStandCheck({
    standPortal: "4",
    standPartner: "4",
    standBank: "Stand 4",
    amountPayment: 10,
    amountBank: 10,
  }).ok,
  "three-way ok",
);

// Outstanding doc present
assert(
  fs.existsSync(path.join(root, "docs/meeting-2026-09-23-outstanding.md")),
  "outstanding doc",
);
assert(fs.existsSync(path.join(root, "docs/bank-reconcile-variance-sop.md")), "variance SOP");
assert(fs.existsSync(path.join(root, "docs/otp-email-staging-check.md")), "otp staging doc");

// Manifest version bump
const manifest = fs.readFileSync(
  path.join(root, "odoo/addons/lakecity_loan_management/__manifest__.py"),
  "utf8",
);
assert(/19\.0\.1\.0\.72/.test(manifest), "module version 19.0.1.0.72");

console.log("meeting-automations self-test: ok");
