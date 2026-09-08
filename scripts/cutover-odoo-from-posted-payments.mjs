#!/usr/bin/env node
/**
 * Cut over Odoo books to the accounting start date (default 2026-01-01).
 *
 * Totals posted BNPL receipts dated before the start, posts one opening-balance
 * JE per stand on that date, then deletes the pre-start receipts. Customer portal
 * payment history is not changed.
 *
 * Requires lakecity_loan_management ≥ 19.0.1.0.67 on Odoo.sh.
 *
 * Usage:
 *   node --env-file=.env scripts/cutover-odoo-from-posted-payments.mjs --dry-run
 *   node --env-file=.env scripts/cutover-odoo-from-posted-payments.mjs --force
 *   node --env-file=.env scripts/cutover-odoo-from-posted-payments.mjs --stand 3072 --force
 *
 * Env: ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN
 * Optional: LAKECITY_ACCOUNTING_START_DATE (YYYY-MM-DD, default 2026-01-01)
 */

import { resolveAccountingStartDate } from "./lib/accounting-cutoff.mjs";

const argv = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const dryRun = argv.has("--dry-run");
const force = argv.has("--force") || process.env.OPENING_BALANCE_FORCE === "1";

const standFilter = (() => {
  const idx = process.argv.indexOf("--stand");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : "";
})();

const cutoffIdx = process.argv.indexOf("--cutoff");
const cutoffDate = resolveAccountingStartDate(
  cutoffIdx >= 0
    ? process.argv[cutoffIdx + 1]
    : process.env.LAKECITY_ACCOUNTING_START_DATE,
);

const odooOrigin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
const apiToken = process.env.LAKECITY_LOAN_API_TOKEN || "";
const ROUTE = "/lakecity/api/v1/loan/opening-balance/cutover-from-payments";

async function main() {
  if (!odooOrigin || !apiToken) {
    console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN");
    process.exit(1);
  }
  if (!dryRun && !force) {
    console.error("Refusing to post without --force (deletes pre-start receipts). Use --dry-run first.");
    process.exit(1);
  }

  const body = {
    cutoff_date: cutoffDate,
    force: !dryRun,
    dry_run: dryRun,
  };
  if (standFilter) body.stand_number = standFilter;

  console.log(`Odoo ${odooOrigin}${ROUTE}`);
  console.log(`Cutover date: ${cutoffDate}${standFilter ? `  stand ${standFilter}` : "  all stands"}`);
  console.log(dryRun ? "DRY RUN — no JEs posted, no receipts deleted\n" : "LIVE — posting opening balances and deleting pre-start receipts\n");

  const res = await fetch(`${odooOrigin}${ROUTE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    console.error(`Non-JSON response (${res.status}): ${text.slice(0, 400)}`);
    process.exit(1);
  }
  if (!res.ok || json.ok === false) {
    if (res.status === 404) {
      console.error(
        "HTTP 404 — cutover-from-payments API not deployed. Upgrade lakecity_loan_management ≥ 19.0.1.0.67 on Odoo.sh.",
      );
    }
    console.error(JSON.stringify(json, null, 2) || text.slice(0, 400));
    process.exit(1);
  }

  if (dryRun) {
    const p = json.preview || {};
    console.log(`Contracts: ${p.contract_count}`);
    console.log(`Stands with pre-start receipts or lumps: ${p.stands_with_pre_or_lump}`);
    console.log(`Pre-start receipts: ${p.pre_count} totaling ${Number(p.pre_total || 0).toFixed(2)}`);
    console.log(`Opening paid to post: ${Number(p.opening_paid_total || 0).toFixed(2)}`);
    console.log(`Pre-start stand-sales JEs: ${p.orphan_move_count}`);
    const stands = (p.stands || []).filter((s) => s.pre_count || s.lump_count).slice(0, 40);
    for (const s of stands) {
      console.log(
        `  stand ${s.stand_number}: ${s.pre_count} receipts ${Number(s.pre_total).toFixed(2)} → opening ${Number(s.opening_paid).toFixed(2)}`,
      );
    }
    if ((p.stands || []).length > 40) console.log("  …");
    return;
  }

  console.log(
    `Posted ${json.posted} stand(s), skipped ${json.skipped}, failures ${json.failures}`,
  );
  const before = json.preview_before || {};
  const after = json.preview_after || {};
  console.log(
    `Before: ${before.pre_count} pre-start receipts totaling ${Number(before.pre_total || 0).toFixed(2)}`,
  );
  console.log(
    `After:  ${after.pre_count} pre-start receipts remaining; leftover JEs ${after.orphan_move_count}`,
  );
  if (json.orphan_moves) {
    console.log(
      `Orphan JE sweep: unlinked ${json.orphan_moves.unlinked}, remaining ${json.orphan_moves.remaining}`,
    );
  }
  for (const row of json.results || []) {
    if (!row.ok) {
      console.error(`FAIL stand ${row.stand_number}: ${row.error}`);
    }
  }
  if (json.failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
