/**
 * Verifies Paynow SHA-512 hashing against the official developer-hub examples.
 * https://developers.paynow.co.zw/docs/paynow/validating_hash/
 * https://developers.paynow.co.zw/docs/paynow/generating_hash/
 */
import { createHash } from "node:crypto";

const SAMPLE_KEY = "3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977";

function parsePaynowBody(body) {
  return body.split("&").filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const raw = eq === -1 ? "" : pair.slice(eq + 1);
    return { key, value: decodeURIComponent(raw.replace(/\+/g, " ")) };
  });
}

function generateHash(fields, key) {
  let concat = "";
  for (const f of fields) {
    if (f.key.toUpperCase() === "HASH") continue;
    concat += f.value ?? "";
  }
  concat += key;
  return createHash("sha512").update(concat, "utf8").digest("hex").toUpperCase();
}

const inbound =
  "status=Ok&browserurl=https%3a%2f%2fstaging.paynow.co.zw%2fPayment%2fConfirmPayment%2f9510&pollurl=https%3a%2f%2fstaging.paynow.co.zw%2fInterface%2fCheckPayment%2f%3fguid%3dc7ed41da-0159-46da-b428-69549f770413&paynowreference=9510&hash=750DD0B0DF374678707BB5AF915AF81C228B9058AD57BB7120569EC68BBB9C2EFC1B26C6375D2BC562AC909B3CD6B2AF1D42E1A5E479FFAC8F4FB3FDCE71DF4D";

const inboundFields = parsePaynowBody(inbound);
const inboundHash = generateHash(inboundFields, SAMPLE_KEY);
const expectedInbound = inboundFields.find((f) => f.key.toUpperCase() === "HASH").value;

if (inboundHash !== expectedInbound) {
  console.error("FAIL inbound hash");
  console.error(" expected", expectedInbound);
  console.error(" got     ", inboundHash);
  process.exit(1);
}

const outbound = [
  { key: "id", value: "1201" },
  { key: "reference", value: "TEST REF" },
  { key: "amount", value: "99.99" },
  { key: "additionalinfo", value: "A test ticket transaction" },
  { key: "returnurl", value: "http://www.google.com/search?q=returnurl" },
  { key: "resulturl", value: "http://www.google.com/search?q=resulturl" },
  { key: "status", value: "Message" },
];
const outboundHash = generateHash(outbound, SAMPLE_KEY);
if (outboundHash.length !== 128) {
  console.error("FAIL outbound hash length", outboundHash.length);
  process.exit(1);
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(num) ? num : 0;
}
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}
function validatePaynowAmount(raw, minInstalment, outstandingBalance) {
  const amount = roundMoney(parseMoney(raw));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, amount, error: "Enter a payment amount" };
  }
  if (outstandingBalance <= 0) {
    return { ok: false, amount, error: "This stand has no outstanding balance" };
  }
  const min = roundMoney(Math.min(minInstalment > 0 ? minInstalment : amount, outstandingBalance));
  const max = roundMoney(outstandingBalance);
  if (amount + 1e-6 < min) {
    return { ok: false, amount, error: `Minimum payment is $${min.toFixed(2)}` };
  }
  if (amount - 1e-6 > max) {
    return { ok: false, amount, error: `Amount cannot exceed the outstanding balance of $${max.toFixed(2)}` };
  }
  return { ok: true, amount };
}

const amountCases = [
  { raw: "1250", min: 1000, bal: 1500, ok: true },
  { raw: "999", min: 1000, bal: 1500, ok: false },
  { raw: "1501", min: 1000, bal: 1500, ok: false },
  { raw: "400", min: 1000, bal: 400, ok: true },
  { raw: "$1,250.00", min: 1000, bal: 2000, ok: true },
];
for (const c of amountCases) {
  const got = validatePaynowAmount(c.raw, c.min, c.bal);
  if (got.ok !== c.ok) {
    console.error("FAIL amount", c, got);
    process.exit(1);
  }
}

console.log("Paynow hash fixtures OK");
console.log(" inbound ", inboundHash.slice(0, 16) + "…");
console.log(" outbound", outboundHash.slice(0, 16) + "…");
console.log(" amount validation OK");
