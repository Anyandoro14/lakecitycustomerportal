#!/usr/bin/env node
/**
 * Self-test: Form "Deposited to:" → COA liquidity mapping.
 */
import {
  DEPOSITED_TO_COA,
  DEPOSITED_TO_LABELS,
  normalizeDepositedToLabel,
  pickLiquidityAccount,
  resolveDepositedToLiquidity,
  scoreAccountNameForDepositedTo,
} from "./deposited-to-liquidity.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(DEPOSITED_TO_LABELS.length === 5, "five form labels");
assert(normalizeDepositedToLabel("Cash") === "Cash", "Cash");
assert(normalizeDepositedToLabel("  cabs  ") === "Cabs", "Cabs normalize");
assert(normalizeDepositedToLabel("Cabs Zig") === "Cabs Zig", "Cabs Zig");
assert(normalizeDepositedToLabel("Jumpstart") === "Jumpstart", "Jumpstart");
assert(normalizeDepositedToLabel("Ecocash") === "Ecocash", "Ecocash");
assert(normalizeDepositedToLabel("Deposited to:") === "", "header alone is empty");
assert(normalizeDepositedToLabel("") === "", "empty");
assert(normalizeDepositedToLabel("Unknown Bank") === "", "unknown");

const cabs = resolveDepositedToLiquidity("Cabs");
assert(cabs && cabs.code === "101410", "Cabs → 101410");
assert(cabs.name.includes("CABS") && cabs.name.includes("USD"), "Cabs name");

const zig = resolveDepositedToLiquidity("Cabs Zig");
assert(zig && zig.code === "101411", "Cabs Zig → 101411");
assert(zig.name.toLowerCase().includes("zig"), "ZiG in name");

assert(resolveDepositedToLiquidity("Cash").code === "101416", "Cash code");
assert(resolveDepositedToLiquidity("Ecocash").code === "101417", "Ecocash code");
assert(resolveDepositedToLiquidity("Jumpstart").code === "101418", "Jumpstart code");

const accounts = [
  { code: "101410", name: "CABS - Main USD Current Account - 1129888509" },
  { code: "101411", name: "CABS - Main ZiG Current Account - 1003526446" },
  { code: "101416", name: "Cash" },
  { code: "101417", name: "Ecocash USD" },
  { code: "101418", name: "Jumpstart (CAD)" },
  { code: "101412", name: "CABS - Waltich - 975" },
];

assert(pickLiquidityAccount(accounts, "Cash").code === "101416", "pick Cash");
assert(pickLiquidityAccount(accounts, "Cabs").code === "101410", "pick Cabs by code");
assert(pickLiquidityAccount(accounts, "Cabs Zig").code === "101411", "pick Cabs Zig");
assert(pickLiquidityAccount(accounts, "Jumpstart").code === "101418", "pick Jumpstart");
assert(pickLiquidityAccount(accounts, "Ecocash").code === "101417", "pick Ecocash");
assert(pickLiquidityAccount(accounts, "") === null, "empty pick");

// Fuzzy without code: CABS + USD + Current beats Waltich
const noCodes = accounts.map(({ name }) => ({ name }));
const fuzzyCabs = pickLiquidityAccount(noCodes, "Cabs");
assert(fuzzyCabs && fuzzyCabs.name.includes("1129888509"), "fuzzy prefers Main USD Current");

const waltichScore = scoreAccountNameForDepositedTo("CABS - Waltich - 975", DEPOSITED_TO_COA.Cabs);
assert(waltichScore < 0, "Waltich must not match Cabs USD Current tokens");

console.log("deposited-to-liquidity self-test: ok");
