#!/usr/bin/env node
/**
 * Self-test: Tanaka VAT extract (15.5/115.5) × receipt.
 */
import { splitGrossPayment } from "./vat-split.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ex = splitGrossPayment(115.5, 15.5);
assert(ex.net === 100, `net expected 100 got ${ex.net}`);
assert(ex.vat === 15.5, `vat expected 15.5 got ${ex.vat}`);

const zero = splitGrossPayment(0, 15.5);
assert(zero.net === 0 && zero.vat === 0, "zero gross");

const exempt = splitGrossPayment(100, 0);
assert(exempt.net === 100 && exempt.vat === 0, "zero rate = no VAT");

// Larger receipt: proportional
const big = splitGrossPayment(1155, 15.5);
assert(big.net === 1000, `1155 net ${big.net}`);
assert(big.vat === 155, `1155 vat ${big.vat}`);

// Rounding: 50 gross → net 43.29, vat 6.71 (50/1.155)
const small = splitGrossPayment(50, 15.5);
assert(small.net + small.vat === 50, "net+vat=gross");
assert(Math.abs(small.vat - (15.5 / 115.5) * 50) < 0.015, "vat ≈ formula");

console.log("vat-split self-test: ok");
