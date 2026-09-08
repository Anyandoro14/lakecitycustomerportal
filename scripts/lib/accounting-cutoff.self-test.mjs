#!/usr/bin/env node
/**
 * Self-test for accounting start cutoff helpers (1 Jan 2026 books start).
 */
import {
  DEFAULT_ACCOUNTING_START_DATE,
  isPreAccountingStart,
  openingPaidFromBuckets,
  resolveAccountingStartDate,
} from "./accounting-cutoff.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(DEFAULT_ACCOUNTING_START_DATE === "2026-01-01", "default start date");
assert(resolveAccountingStartDate("") === "2026-01-01", "empty env falls back");
assert(resolveAccountingStartDate("2026-07-01") === "2026-07-01", "override start");
assert(resolveAccountingStartDate("nope") === "2026-01-01", "invalid override ignored");

assert(isPreAccountingStart("2025-12-31") === true, "31 Dec 2025 is pre-start");
assert(isPreAccountingStart("2025-12-05") === true, "5 Dec 2025 is pre-start");
assert(isPreAccountingStart("2026-01-01") === false, "1 Jan 2026 is on start");
assert(isPreAccountingStart("2026-01-02") === false, "post-start is kept");
assert(isPreAccountingStart("not-a-date") === false, "invalid date is not pre-start");
assert(isPreAccountingStart("2026-06-01", "2026-07-01") === true, "custom start");

assert(openingPaidFromBuckets(43000, 0) === 43000, "pre only");
assert(openingPaidFromBuckets(0, 12000) === 12000, "lump only");
assert(openingPaidFromBuckets(100, 250) === 250, "keep larger lump");
assert(openingPaidFromBuckets(400, 250) === 400, "keep larger actual receipts");
assert(openingPaidFromBuckets(0, 0) === 0, "nothing paid");

const demo = [
  { stand: "4", date: "2025-12-05", amount: 444 },
  { stand: "5", date: "2025-12-05", amount: 1000 },
  { stand: "26", date: "2025-12-05", amount: 20110 },
  { stand: "26", date: "2025-12-05", amount: 5300 },
  { stand: "26", date: "2026-02-05", amount: 500 },
];
const byStand = new Map();
for (const row of demo) {
  if (!isPreAccountingStart(row.date)) continue;
  byStand.set(row.stand, (byStand.get(row.stand) || 0) + row.amount);
}
assert(byStand.get("4") === 444, "stand 4 total");
assert(byStand.get("26") === 25410, "stand 26 lumps two 2025 receipts, ignores 2026");
assert(!byStand.has("x"), "no extra stands");

console.log("accounting-cutoff self-test: ok");
