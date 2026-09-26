#!/usr/bin/env node
/**
 * Self-test: bank-statement three-way stand check.
 */
import {
  extractStandFromBankText,
  threeWayStandCheck,
} from "./bank-stand-reconcile.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(extractStandFromBankText("Payment Stand 26 EcoCash") === "26", "Stand 26");
assert(extractStandFromBankText("ST-14 CABS transfer") === "14", "ST-14");
assert(extractStandFromBankText("BNPL #7 deposit") === "7", "#7");
assert(extractStandFromBankText("random memo") === "", "no stand");

const ok = threeWayStandCheck({
  standPortal: "26",
  standPartner: "26",
  standBank: "Stand 26 receipt",
  amountPayment: 500,
  amountBank: 500,
});
assert(ok.ok === true, "three-way ok");
assert(ok.stand_portal === "26", "portal stand");

const mismatch = threeWayStandCheck({
  standPortal: "26",
  standPartner: "26",
  standBank: "Stand 99",
  amountPayment: 500,
  amountBank: 500,
});
assert(mismatch.ok === false && mismatch.reason === "stand_mismatch", "stand mismatch");

const partnerDiff = threeWayStandCheck({
  standPortal: "26",
  standPartner: "27",
  standBank: "Stand 26",
  amountPayment: 500,
  amountBank: 500,
});
assert(partnerDiff.ok === false && partnerDiff.reason === "stand_mismatch", "partner mismatch");

const amt = threeWayStandCheck({
  standPortal: "26",
  standPartner: "26",
  standBank: "Stand 26",
  amountPayment: 500,
  amountBank: 499,
  tolerance: 0.01,
});
assert(amt.ok === false && amt.reason === "amount_mismatch", "amount mismatch");

const withinTol = threeWayStandCheck({
  standPortal: "26",
  standPartner: "26",
  standBank: "Stand 26",
  amountPayment: 500,
  amountBank: 500.005,
  tolerance: 0.01,
});
assert(withinTol.ok === true, "within tolerance");

const missing = threeWayStandCheck({
  standPortal: "26",
  standPartner: "26",
  standBank: "no stand here",
  amountPayment: 100,
  amountBank: 100,
});
assert(missing.ok === false && missing.reason === "missing_stand", "missing bank stand");

console.log("bank-stand-reconcile self-test: ok");
