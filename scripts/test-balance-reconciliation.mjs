/**
 * Unit tests for three-way balance reconciliation.
 * Run: node --experimental-strip-types scripts/test-balance-reconciliation.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const engineUrl = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "../supabase/functions/_shared/balance-reconciliation.ts"),
).href;

const {
  reconcileLedgers,
  formatSignedMoney,
  parseMoney,
  signedDelta,
} = await import(engineUrl);

function stand(partial = {}) {
  return {
    standNumber: "A1",
    customerName: "Test Customer",
    totalPrice: 36000,
    deposit: 2000,
    totalPaid: 8000,
    currentBalance: 28000,
    ...partial,
  };
}

{
  const r = reconcileLedgers([stand()], [stand()], [stand()]);
  assert.equal(r.summary.matched, 1);
  assert.equal(r.summary.variances, 0);
  assert.equal(r.rows[0].status, "match");
  assert.match(r.rows[0].likelyCause, /agree/i);
}

{
  const r = reconcileLedgers(
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
    [stand({ currentBalance: 27000, totalPaid: 9000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
  );
  assert.equal(r.rows[0].status, "variance");
  assert.equal(r.rows[0].sheetsVsOdooBalance, 1000);
  assert.equal(r.rows[0].likelySource, "odoo");
  assert.match(r.rows[0].likelyCause, /Odoo total paid is higher/i);
}

{
  const r = reconcileLedgers(
    [stand({ currentBalance: 27000, totalPaid: 9000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
  );
  assert.equal(r.rows[0].status, "variance");
  assert.equal(r.rows[0].sheetsVsOdooBalance, -1000);
  assert.equal(r.rows[0].likelySource, "sheets");
  assert.match(r.rows[0].likelyCause, /Sheets total paid is higher/i);
}

{
  const r = reconcileLedgers(
    [stand()],
    [stand({ standNumber: "B2", customerName: "Other" })],
    [stand()],
  );
  const missingOdoo = r.rows.find((x) => x.standNumber === "A1");
  const missingSheet = r.rows.find((x) => x.standNumber === "B2");
  assert.equal(missingOdoo.status, "missing_source");
  assert.equal(missingOdoo.likelySource, "odoo");
  assert.match(missingOdoo.likelyCause, /missing from Odoo/i);
  assert.equal(missingSheet.status, "missing_source");
  assert.match(missingSheet.likelyCause, /Missing from Master Sales/i);
}

{
  const r = reconcileLedgers(
    [stand({ deposit: 2000 })],
    [stand({ deposit: 0, totalPaid: 6000, currentBalance: 30000 })],
    [stand({ deposit: 2000 })],
  );
  assert.equal(r.rows[0].status, "variance");
  assert.match(r.rows[0].likelyCause, /Deposit differs/i);
}

{
  const r = reconcileLedgers(
    [stand({ totalPaid: 8000, currentBalance: 28000 })],
    [stand({ totalPaid: 8000, currentBalance: 28000 })],
    [stand({ totalPaid: 10000, currentBalance: 26000 })],
  );
  assert.equal(r.rows[0].likelySource, "standledger");
  assert.match(r.rows[0].likelyCause, /portal receipts exceed/i);
}

{
  const r = reconcileLedgers(
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
    [stand({ currentBalance: 27000, totalPaid: 9000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
  );
  const htmlMod = await import(
    pathToFileURL(
      join(dirname(fileURLToPath(import.meta.url)), "../supabase/functions/_shared/balance-reconciliation-report.ts"),
    ).href
  );
  const html = htmlMod.buildReconciliationEmailHtml(r, {
    tenantName: "LakeCity",
    sheetsLabel: "Collection Schedule",
    generatedAt: "test",
  });
  assert.match(html, /Weekly account balance reconciliation/);
  assert.match(html, /\+\$1,000\.00/);
  assert.match(html, /Odoo total paid is higher/);
  const csv = htmlMod.buildReconciliationCsv(r);
  assert.match(csv, /A1,Test Customer,variance/);
}

{
  const r = reconcileLedgers(
    [stand({ currentBalance: 28000.004, totalPaid: 8000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
  );
  assert.equal(r.rows[0].status, "match");
}

{
  const r = reconcileLedgers(
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
    [stand({ currentBalance: 27000, totalPaid: 9000 })],
    [stand({ currentBalance: 28000, totalPaid: 8000 })],
  );
  const htmlMod = await import(
    pathToFileURL(
      join(dirname(fileURLToPath(import.meta.url)), "../supabase/functions/_shared/balance-reconciliation-report.ts"),
    ).href
  );
  const html = htmlMod.buildReconciliationEmailHtml(r, {
    tenantName: "LakeCity",
    sheetsLabel: "Collection Schedule",
    generatedAt: "test",
  });
  assert.match(html, /Weekly account balance reconciliation/);
  assert.match(html, /\+\$1,000\.00/);
  assert.match(html, /Odoo total paid is higher/);
  const csv = htmlMod.buildReconciliationCsv(r);
  assert.match(csv, /A1,Test Customer,variance/);
}

console.log("test-balance-reconciliation: all assertions passed");
