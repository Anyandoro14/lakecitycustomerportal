#!/usr/bin/env node
import {
  parseUkPreferDate,
  isDayMonthAmbiguous,
  swapDayMonthIso,
  isoToDdMmYyyy,
  normStand,
} from "./uk-date-parse.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(parseUkPreferDate("2026-03-04") === "2026-03-04", "ISO");
assert(parseUkPreferDate("03/04/2026") === "2026-04-03", "UK dd/mm → 3 Apr");
assert(parseUkPreferDate("3/4/2026") === "2026-04-03", "UK single-digit");
assert(parseUkPreferDate("03-04-2026") === "2026-04-03", "UK dashes");
assert(parseUkPreferDate("07/01/2026") === "2026-01-07", "7 Jan not 1 Jul");
assert(parseUkPreferDate("") === null, "empty");
assert(parseUkPreferDate(null) === null, "null");

assert(isDayMonthAmbiguous("2026-02-03") === true, "ambiguous 3 Feb");
assert(isDayMonthAmbiguous("2026-02-15") === false, "day>12 unambiguous");
assert(isDayMonthAmbiguous("2026-05-05") === false, "same day/month");

assert(swapDayMonthIso("2026-02-03") === "2026-03-02", "swap 3 Feb ↔ 2 Mar");
assert(swapDayMonthIso("2026-02-15") === null, "no swap unambiguous");

assert(isoToDdMmYyyy("2026-02-03") === "03/02/2026", "display");
assert(normStand("59.0") === "59", "stand float");
assert(normStand("#3072") === "3072", "stand hash");

console.log("uk-date-parse.self-test: ok");
