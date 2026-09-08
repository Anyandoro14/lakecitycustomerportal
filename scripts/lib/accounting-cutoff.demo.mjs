#!/usr/bin/env node
/**
 * Demo: total the 2025 Stand Sales receipts the accountant screenshot showed,
 * skip any 2026 cash, and compute per-stand opening paid for 1 Jan 2026.
 */
import { isPreAccountingStart, openingPaidFromBuckets } from "./accounting-cutoff.mjs";
import { writeFileSync } from "node:fs";

const CUTOFF = "2026-01-01";
const receipts = [
  { stand: "00004", partner: "Debrah Gwama", date: "2025-12-05", amount: 444, ref: "LC-PAY-00087" },
  { stand: "00005", partner: "Elizabeth-glende and Alex Saungweme", date: "2025-12-05", amount: 1000, ref: "LC-PAY-00093" },
  { stand: "00006", partner: "Regis and Daphine Sayi and Gomwe", date: "2025-12-05", amount: 1000, ref: "LC-PAY-00099" },
  { stand: "00008", partner: "Chido Moira Mutongwizo", date: "2025-12-05", amount: 583, ref: "LC-PAY-000106" },
  { stand: "00010", partner: "Tawanda & Bertha Kunzwa", date: "2025-12-05", amount: 400, ref: "LC-PAY-000113" },
  { stand: "00012", partner: "Sithabile Kashora", date: "2025-12-05", amount: 425, ref: "LC-PAY-000126" },
  { stand: "00018", partner: "Simon and Margaret Muchatibaya", date: "2025-12-05", amount: 1667, ref: "LC-PAY-000140" },
  { stand: "00020", partner: "Everstone and Linda Rusere and Tiyatara", date: "2025-12-05", amount: 3000, ref: "LC-PAY-000150" },
  { stand: "00021", partner: "Jackson and Natasha Nyangwa and Hove", date: "2025-12-05", amount: 1500, ref: "LC-PAY-000155" },
  { stand: "00023", partner: "Givemore Mhene and Jescah Munangwa", date: "2025-12-05", amount: 2958, ref: "LC-PAY-000162" },
  { stand: "00024", partner: "Diana Mhuriro", date: "2025-12-05", amount: 15000, ref: "LC-PAY-000169" },
  { stand: "00025", partner: "Hilton Mahachi and Tendai Murapa", date: "2025-12-05", amount: 2015, ref: "LC-PAY-000172" },
  { stand: "00026", partner: "Leo and Chipo Mazambani", date: "2025-12-05", amount: 20110, ref: "LC-PAY-000025" },
  { stand: "00026", partner: "Leo and Chipo Mazambani", date: "2025-12-05", amount: 5300, ref: "LC-PAY-000178" },
  { stand: "00029", partner: "Dorris Kabanzi", date: "2025-12-05", amount: 1200, ref: "LC-PAY-000185" },
  { stand: "00030", partner: "Florance Manyatera", date: "2025-12-05", amount: 600, ref: "LC-PAY-000191" },
  { stand: "00032", partner: "Gloria Tongoona", date: "2025-12-05", amount: 1163, ref: "LC-PAY-000196" },
  { stand: "00033", partner: "Elizabeth Varela", date: "2025-12-05", amount: 1200, ref: "LC-PAY-000200" },
  { stand: "00034", partner: "Silentokozo Maphosa", date: "2025-12-05", amount: 1251, ref: "LC-PAY-000203" },
  { stand: "00036", partner: "Bernadety Gumbanjera", date: "2025-12-05", amount: 1400, ref: "LC-PAY-000215" },
  // Control: a 2026 receipt must NOT enter the opening lump
  { stand: "00026", partner: "Leo and Chipo Mazambani", date: "2026-02-05", amount: 500, ref: "LC-PAY-FUTURE" },
];

const byStand = new Map();
let deleted = 0;
let kept = 0;
for (const r of receipts) {
  if (isPreAccountingStart(r.date, CUTOFF)) {
    deleted += 1;
    const cur = byStand.get(r.stand) || { partner: r.partner, pre: 0, lump: 0, count: 0 };
    cur.pre += r.amount;
    cur.count += 1;
    byStand.set(r.stand, cur);
  } else {
    kept += 1;
  }
}

// Existing opening lump smaller than actual 2025 cash → keep the larger actual
byStand.get("00026").lump = 10000;

console.log(`Accounting start: ${CUTOFF}`);
console.log(`Input receipts: ${receipts.length}  delete (pre-start): ${deleted}  keep (2026+): ${kept}`);
console.log("");
console.log("stand    receipts  2025 total  existing lump  opening JE (1 Jan 2026)");
let openingSum = 0;
for (const [stand, row] of [...byStand.entries()].sort()) {
  const opening = openingPaidFromBuckets(row.pre, row.lump);
  openingSum += opening;
  console.log(
    `${stand}  ${String(row.count).padStart(3)}       ${row.pre.toFixed(2).padStart(10)}  ${row.lump.toFixed(2).padStart(13)}  ${opening.toFixed(2).padStart(12)}  ${row.partner}`,
  );
}
console.log("");
console.log(`Stands: ${byStand.size}`);
console.log(`Opening paid to post on ${CUTOFF}: ${openingSum.toFixed(2)}`);
console.log(`Leo/Chipo (00026): 2025 receipts 25410 + ignored 2026 500; lump 10000 → opening ${openingPaidFromBuckets(25410, 10000)}`);

if (deleted !== 20) throw new Error(`expected 20 pre-start receipts, got ${deleted}`);
if (kept !== 1) throw new Error(`expected 1 post-start receipt, got ${kept}`);
if (byStand.get("00026").pre !== 25410) throw new Error("stand 00026 2025 total");
if (openingPaidFromBuckets(25410, 10000) !== 25410) throw new Error("max() should keep fuller 2025 total");
if (openingSum !== 62216) throw new Error(`expected opening sum 62216, got ${openingSum}`);

console.log("\ncutover demo: ok");
