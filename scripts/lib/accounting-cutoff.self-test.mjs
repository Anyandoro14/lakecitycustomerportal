#!/usr/bin/env node
/**
 * Self-test for accounting start cutoff helpers (1 Jan 2026 books start),
 * day-first date parsing, and cutover debit account selection.
 */
import {
  ACCOUNT_CODES,
  DEFAULT_ACCOUNTING_START_DATE,
  isPreAccountingStart,
  looksLikeDayMonthSwap,
  openingPaidFromBuckets,
  parseSheetDate,
  PAYMENT_SOURCE_LIQUIDITY,
  resolveAccountingStartDate,
  selectReceiptDebitAccount,
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

// --- day-first date parsing ---
const d1 = parseSheetDate("05/01/2026");
assert(d1.iso === "2026-01-05", `05/01/2026 → 5 Jan, got ${d1.iso}`);
assert(d1.dayMonthSwapSuspicion === true, "05/01 is ambiguous day/month");
assert(d1.usAltIso === "2026-05-01", "US alt is 1 May");

const d2 = parseSheetDate("13/02/2026");
assert(d2.iso === "2026-02-13", "13/02 unambiguous day-first");
assert(d2.dayMonthSwapSuspicion === false, "day 13 cannot be month");

const d3 = parseSheetDate("02/13/2026");
assert(d3.iso === "2026-13-02" || d3.iso === null || d3.iso === "2026-02-13", "02/13 day-first invalid month");
// day-first tries month=13 day=2 → null; month-first fallback → 2026-02-13
assert(d3.iso === "2026-02-13", `02/13 falls back to month-first, got ${d3.iso}`);
assert(d3.dayMonthSwapSuspicion === true, "flagged as swap suspicion");

const d4 = parseSheetDate("5 January 2026");
assert(d4.iso === "2026-01-05", "named month day-first");

const d5 = parseSheetDate("2026-03-15");
assert(d5.iso === "2026-03-15", "ISO passthrough");
assert(d5.ambiguous === false, "ISO not ambiguous");

const d6 = parseSheetDate("not a date");
assert(d6.unparseable === true && d6.iso === null, "unparseable flagged");

// Must NOT use US native for ambiguous slash without opt-in
const d7 = parseSheetDate("01/02/2026");
assert(d7.iso === "2026-02-01", `01/02 prefers 1 Feb (dd/MM), got ${d7.iso}`);

assert(looksLikeDayMonthSwap("2026-01-05", "2026-05-01") === true, "swap detect");
assert(looksLikeDayMonthSwap("2026-01-05", "2026-01-05") === false, "same date not swap");

// --- cutover debit account ---
const pre = selectReceiptDebitAccount("2025-12-05");
assert(pre.kind === "retained_earnings", "pre → RE");
assert(pre.accountCode === ACCOUNT_CODES.retained_earnings, "RE code 303000");
assert(pre.postingDate === "2026-01-01", "post on cutover date");

const lump = selectReceiptDebitAccount("2026-01-01", { isOpeningBalanceLump: true });
assert(lump.kind === "retained_earnings", "opening lump → RE even on start date");

const live = selectReceiptDebitAccount("2026-02-10", { source: "bank_transfer" });
assert(live.kind === "bank", "post-cutoff → bank");
assert(live.accountCode === PAYMENT_SOURCE_LIQUIDITY.bank_transfer, "CABS USD");
assert(live.postingDate === "2026-02-10", "true receipt date");

const eco = selectReceiptDebitAccount("2026-03-01", { source: "ecocash" });
assert(eco.accountCode === ACCOUNT_CODES.bank_cabs_usd_main, "ecocash default CABS until wallet journal set");

console.log("accounting-cutoff self-test: ok");
