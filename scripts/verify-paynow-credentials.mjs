/**
 * Live credential check against Paynow initiate.
 * Reads PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY from the environment.
 * Never prints the key.
 */
import { createHash } from "node:crypto";

const id = (process.env.PAYNOW_INTEGRATION_ID || "26786").trim();
const key = (process.env.PAYNOW_INTEGRATION_KEY || "").trim();
if (!key) {
  console.error("PAYNOW_INTEGRATION_KEY is not set");
  process.exit(2);
}

function generateHash(fields) {
  let concat = "";
  for (const f of fields) {
    if (f.key.toUpperCase() === "HASH") continue;
    concat += f.value ?? "";
  }
  concat += key;
  return createHash("sha512").update(concat, "utf8").digest("hex").toUpperCase();
}

function parseBody(body) {
  const rec = {};
  for (const pair of body.split("&").filter(Boolean)) {
    const eq = pair.indexOf("=");
    const k = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    const raw = eq === -1 ? "" : pair.slice(eq + 1);
    rec[k] = decodeURIComponent(raw.replace(/\+/g, " "));
  }
  return rec;
}

const reference = `SL-CREDCHK-${Date.now()}`;
const fields = [
  { key: "id", value: id },
  { key: "reference", value: reference },
  { key: "amount", value: "1.00" },
  { key: "additionalinfo", value: "StandLedger credential check — do not pay" },
  { key: "returnurl", value: "https://lakecity.standledger.io/pay/return?reference=" + encodeURIComponent(reference) },
  { key: "resulturl", value: "https://gumkxjeahojrcaqnosyz.supabase.co/functions/v1/paynow-webhook" },
  { key: "status", value: "Message" },
];
fields.push({ key: "hash", value: generateHash(fields) });

const body = fields
  .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
  .join("&");

const res = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});
const text = await res.text();
const rec = parseBody(text);

const status = rec.status || "";
const ok = status.toLowerCase() === "ok" && Boolean(rec.pollurl);
const out = {
  http_status: res.status,
  paynow_status: status || null,
  error: rec.error || null,
  has_browserurl: Boolean(rec.browserurl),
  has_pollurl: Boolean(rec.pollurl),
  reference,
  integration_id: id,
  key_fingerprint: createHash("sha256").update(key).digest("hex").slice(0, 12),
  ok,
};
console.log(JSON.stringify(out, null, 2));
if (!ok) process.exit(1);
