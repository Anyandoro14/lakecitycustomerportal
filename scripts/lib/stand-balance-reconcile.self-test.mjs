#!/usr/bin/env node
import { classifyStandBalanceException, STAND_SALES } from "./stand-balance-reconcile.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(STAND_SALES.tradeReceivableCode === "121000", "AR code");
assert(STAND_SALES.journalCode === "STND", "journal");
assert(STAND_SALES.matchKey === "stand_number", "match key");

// Client 6425, Stand Sales 5000 → drift; master agrees with client → JE issue
let e = classifyStandBalanceException({
  clientBalance: 6425,
  standSalesBalance: 5000,
  masterBalance: 6425,
  clientPaid: 1075,
  masterPaid: 1075,
});
assert(e.kind === "client_vs_stand_sales", "kind client vs stand sales");
assert(e.difference === -1425, `diff ${e.difference}`);
assert(e.likely_cause === "stand_sales_je_misallocation_or_orphan_ar", e.likely_cause);

// Paid totals differ → date swap / missing receipt hint
e = classifyStandBalanceException({
  clientBalance: 7000,
  standSalesBalance: 6425,
  masterBalance: 6425,
  clientPaid: 500,
  masterPaid: 1075,
});
assert(e.likely_cause === "missing_or_extra_receipt_check_date_swaps", e.likely_cause);

// Client wrong vs master, Stand Sales matches master
e = classifyStandBalanceException({
  clientBalance: 7000,
  standSalesBalance: 6425,
  masterBalance: 6425,
  clientPaid: 500,
  masterPaid: 1075,
});
assert(e.kind === "client_vs_stand_sales", "still primary kind");

// No stand sales column — client vs master only
e = classifyStandBalanceException({
  clientBalance: 7000,
  standSalesBalance: null,
  masterBalance: 6425,
  clientPaid: 500,
  masterPaid: 1075,
});
assert(e.kind === "client_vs_master", e.kind);
assert(e.likely_cause === "missing_receipt_or_date_swap_affecting_paid_total", e.likely_cause);

// Aligned → null
e = classifyStandBalanceException({
  clientBalance: 6425,
  standSalesBalance: 6425,
  masterBalance: 6425,
  clientPaid: 1075,
  masterPaid: 1075,
});
assert(e === null, "aligned");

console.log("stand-balance-reconcile.self-test: ok");
