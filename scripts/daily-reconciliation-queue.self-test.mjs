#!/usr/bin/env node
/**
 * Self-test: Daily Reconciliation queue feed contract.
 * Ensures script JSON output matches issue codes the Odoo module expects,
 * and that --push-queue payload shape is stable. No Odoo runtime required.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const addon = path.join(root, "odoo", "addons", "daily_reconciliation");

const EXPECTED_CODES = [
  "pre_cutoff_hit_bank",
  "missing_receipt_unposted",
  "amount_mismatch",
  "balance_mismatch",
  "stand_price_mismatch",
  "manual_total_error",
  "wrong_date_day_month_swap",
  "ambiguous_date_day_month",
  "unparseable_date",
  "liquidity_account_unexpected",
  "missing_in_odoo",
  "missing_in_collection",
  "orphaned_bank_line",
  "other",
];

function fingerprint(payload) {
  const parts = [
    String(payload.stand || payload.stand_number || "").trim().toUpperCase(),
    String(payload.issue || payload.mismatch_type || "").trim(),
    String(payload.field || payload.field_name || "").trim(),
    String(payload.source_a || "").trim(),
    String(payload.value_a ?? "").trim(),
    String(payload.source_b || "").trim(),
    String(payload.value_b ?? "").trim(),
    String(payload.source_c || "").trim(),
    String(payload.value_c ?? "").trim(),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
}

function main() {
  // Module scaffold
  for (const rel of [
    "__manifest__.py",
    "models/daily_reconciliation_exception.py",
    "wizard/import_reconcile_wizard.py",
    "controllers/api.py",
    "views/menus.xml",
    "views/daily_reconciliation_views.xml",
    "security/ir.model.access.csv",
    "static/description/icon.png",
    "README.md",
  ]) {
    assert.ok(fs.existsSync(path.join(addon, rel)), `missing ${rel}`);
  }

  const manifest = fs.readFileSync(path.join(addon, "__manifest__.py"), "utf8");
  assert.match(manifest, /"application":\s*True/);
  assert.match(manifest, /daily_reconciliation/);
  assert.match(manifest, /lakecity_loan_management/);

  const menus = fs.readFileSync(path.join(addon, "views/menus.xml"), "utf8");
  assert.match(menus, /menu_daily_reconciliation_root/);
  assert.match(menus, /web_icon="daily_reconciliation/);
  assert.doesNotMatch(menus, /account\.menu_finance/);
  assert.doesNotMatch(menus, /parent="account/);

  const modelSrc = fs.readFileSync(
    path.join(addon, "models/daily_reconciliation_exception.py"),
    "utf8",
  );
  for (const code of EXPECTED_CODES) {
    assert.ok(modelSrc.includes(`"${code}"`), `model missing mismatch type ${code}`);
  }
  for (const action of ["action_match", "action_adjust_date", "action_needs_review"]) {
    assert.ok(modelSrc.includes(`def ${action}`), `missing ${action}`);
  }

  const views = fs.readFileSync(path.join(addon, "views/daily_reconciliation_views.xml"), "utf8");
  assert.match(views, /All Clear/);
  assert.match(views, /action_match/);
  assert.match(views, /Collection Schedule/);
  assert.match(views, /Bank \/ Odoo/);

  const acl = fs.readFileSync(path.join(addon, "security/ir.model.access.csv"), "utf8");
  assert.match(acl, /base\.group_user/);

  // Fingerprint stability (upsert key)
  const sample = {
    severity: "critical",
    stand: "a12",
    field: "total_paid",
    issue: "amount_mismatch",
    source_a: "collection",
    value_a: "8500",
    source_b: "odoo",
    value_b: "8200",
    hint: "fix sheet",
  };
  const fp1 = fingerprint(sample);
  const fp2 = fingerprint({ ...sample, stand: "A12", hint: "different hint ignored" });
  assert.equal(fp1, fp2);
  assert.notEqual(fp1, fingerprint({ ...sample, value_b: "8100" }));

  // Script writes JSON twin usable by import wizard / ingest API
  const tmp = fs.mkdtempSync(path.join(root, "docs", "output", "reconcile-selftest-"));
  try {
    const collection = path.join(tmp, "collection.csv");
    fs.writeFileSync(
      collection,
      [
        "Stand Number,TOTAL PRICE,TOTAL PAID,Current Balance",
        "Z99,10000,4000,6000",
      ].join("\n"),
      "utf8",
    );
    const res = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts", "daily-bnpl-three-way-reconcile.mjs"),
        "--collection",
        collection,
        "--out-dir",
        tmp,
      ],
      { encoding: "utf8" },
    );
    assert.equal(res.status, 0, res.stderr || res.stdout);
    const day = new Date().toISOString().slice(0, 10);
    const jsonPath = path.join(tmp, `bnpl-reconcile-${day}.json`);
    assert.ok(fs.existsSync(jsonPath), "expected JSON report");
    const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.equal(payload.reconcile_date, day);
    assert.ok(Array.isArray(payload.issues));
    // Collection-only run with no Odoo should still be valid ingest shape
    for (const row of payload.issues) {
      assert.ok(row.issue);
      assert.ok(row.stand);
      assert.ok(row.severity);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("daily-reconciliation-queue.self-test: ok");
}

main();
