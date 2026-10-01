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

assert(DEPOSITED_TO_LABELS.length === 9, "nine form labels");
assert(normalizeDepositedToLabel("Cash") === "Cash", "Cash");
assert(normalizeDepositedToLabel("CABS USD") === "CABS USD", "CABS USD");
assert(normalizeDepositedToLabel("  cabs  ") === "CABS USD", "legacy Cabs → CABS USD");
assert(normalizeDepositedToLabel("Cabs") === "CABS USD", "legacy Cabs exact");
assert(normalizeDepositedToLabel("Cabs Zig") === "Cabs Zig", "Cabs Zig");
assert(normalizeDepositedToLabel("Jumpstart") === "Jumpstart", "Jumpstart");
assert(normalizeDepositedToLabel("Ecocash") === "Ecocash", "Ecocash");
assert(normalizeDepositedToLabel("CBZ USD") === "CBZ USD", "CBZ USD");
assert(normalizeDepositedToLabel("CBZ") === "CBZ USD", "legacy CBZ → CBZ USD");
assert(normalizeDepositedToLabel("Cabs Waltich") === "Cabs Waltich", "Cabs Waltich");
assert(normalizeDepositedToLabel("cabs - waltich") === "Cabs Waltich", "waltich alias dash");
assert(normalizeDepositedToLabel("waltich") === "Cabs Waltich", "waltich alias short");
assert(normalizeDepositedToLabel("CBZ ZIG") === "CBZ ZIG", "CBZ ZIG");
assert(normalizeDepositedToLabel("cbz zig") === "CBZ ZIG", "cbz zig alias");
assert(normalizeDepositedToLabel("EcoCash ZIG") === "EcoCash ZIG", "EcoCash ZIG");
assert(normalizeDepositedToLabel("ecocash zig") === "EcoCash ZIG", "ecocash zig alias");
assert(normalizeDepositedToLabel("Deposited to:") === "", "header alone is empty");
assert(normalizeDepositedToLabel("") === "", "empty");
assert(normalizeDepositedToLabel("Unknown Bank") === "", "unknown");

const cabs = resolveDepositedToLiquidity("CABS USD");
assert(cabs && cabs.code === "101410", "CABS USD → 101410");
assert(cabs.name.includes("CABS") && cabs.name.includes("USD"), "CABS USD name");
assert(resolveDepositedToLiquidity("Cabs").code === "101410", "legacy Cabs still → 101410");

const zig = resolveDepositedToLiquidity("Cabs Zig");
assert(zig && zig.code === "101411", "Cabs Zig → 101411");
assert(zig.name.toLowerCase().includes("zig"), "ZiG in name");

assert(resolveDepositedToLiquidity("Cash").code === "101416", "Cash code");
assert(resolveDepositedToLiquidity("Ecocash").code === "101417", "Ecocash code");
assert(resolveDepositedToLiquidity("Jumpstart").code === "101418", "Jumpstart code");
assert(resolveDepositedToLiquidity("CBZ USD").code === "101419", "CBZ USD → 101419");
assert(resolveDepositedToLiquidity("CBZ").code === "101419", "legacy CBZ → 101419");
assert(
  resolveDepositedToLiquidity("CBZ USD").name.includes("27794540028"),
  "CBZ USD account number in name",
);
assert(resolveDepositedToLiquidity("Cabs Waltich").code === "101412", "Cabs Waltich → 101412");
assert(
  resolveDepositedToLiquidity("Cabs Waltich").name === "CABS - Waltich - 975",
  "Cabs Waltich COA name",
);

// Unmapped ZiG labels: recognized but fail-closed (no invent COA)
const cbzZig = resolveDepositedToLiquidity("CBZ ZIG");
assert(cbzZig && cbzZig.label === "CBZ ZIG", "CBZ ZIG resolves label");
assert(cbzZig.code === null && cbzZig.match === "unmapped", "CBZ ZIG unmapped / no code");
assert(cbzZig.blocker && cbzZig.blocker.includes("CBZ"), "CBZ ZIG blocker text");

const ecoZig = resolveDepositedToLiquidity("EcoCash ZIG");
assert(ecoZig && ecoZig.label === "EcoCash ZIG", "EcoCash ZIG resolves label");
assert(ecoZig.code === null && ecoZig.match === "unmapped", "EcoCash ZIG unmapped / no code");
assert(ecoZig.blocker && /EcoCash|Ecocash/i.test(ecoZig.blocker), "EcoCash ZIG blocker text");

const accounts = [
  { code: "101410", name: "CABS - Main USD Current Account - 1129888509" },
  { code: "101411", name: "CABS - Main ZiG Current Account - 1003526446" },
  { code: "101416", name: "Cash" },
  { code: "101417", name: "Ecocash USD" },
  { code: "101418", name: "Jumpstart (CAD)" },
  { code: "101419", name: "CBZ - Main USD Current Account - 27794540028" },
  { code: "101412", name: "CABS - Waltich - 975" },
];

assert(pickLiquidityAccount(accounts, "Cash").code === "101416", "pick Cash");
assert(pickLiquidityAccount(accounts, "CABS USD").code === "101410", "pick CABS USD by code");
assert(pickLiquidityAccount(accounts, "Cabs").code === "101410", "pick legacy Cabs");
assert(pickLiquidityAccount(accounts, "Cabs Zig").code === "101411", "pick Cabs Zig");
assert(pickLiquidityAccount(accounts, "Jumpstart").code === "101418", "pick Jumpstart");
assert(pickLiquidityAccount(accounts, "Ecocash").code === "101417", "pick Ecocash");
assert(pickLiquidityAccount(accounts, "CBZ USD").code === "101419", "pick CBZ USD");
assert(pickLiquidityAccount(accounts, "CBZ").code === "101419", "pick legacy CBZ");
assert(pickLiquidityAccount(accounts, "Cabs Waltich").code === "101412", "pick Cabs Waltich");
assert(pickLiquidityAccount(accounts, "CBZ ZIG") === null, "CBZ ZIG fail-closed");
assert(pickLiquidityAccount(accounts, "EcoCash ZIG") === null, "EcoCash ZIG fail-closed");
assert(pickLiquidityAccount(accounts, "") === null, "empty pick");

// Fuzzy without code: CABS + USD + Current beats Waltich
const noCodes = accounts.map(({ name }) => ({ name }));
const fuzzyCabs = pickLiquidityAccount(noCodes, "CABS USD");
assert(fuzzyCabs && fuzzyCabs.name.includes("1129888509"), "fuzzy prefers Main USD Current");

const waltichScore = scoreAccountNameForDepositedTo(
  "CABS - Waltich - 975",
  DEPOSITED_TO_COA["CABS USD"],
);
assert(waltichScore < 0, "Waltich must not match CABS USD Current tokens");

assert(
  scoreAccountNameForDepositedTo("anything", DEPOSITED_TO_COA["CBZ ZIG"]) < 0,
  "unmapped CBZ ZIG never scores",
);

console.log("deposited-to-liquidity self-test: ok");
