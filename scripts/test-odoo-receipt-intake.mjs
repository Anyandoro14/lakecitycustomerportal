#!/usr/bin/env node
/**
 * POST a sample receipt payload to Odoo intake (Make-free path).
 *
 *   ODOO_ORIGIN=https://your-odoo-host \
 *   LAKECITY_API_TOKEN=your-token \
 *   node scripts/test-odoo-receipt-intake.mjs
 *
 * Optional:
 *   STAND_NUMBER=A12
 *   AMOUNT=1.00
 *   RECEIPT_URL=https://example.com/receipt-placeholder.pdf
 *
 * Or: node --env-file=.env scripts/test-odoo-receipt-intake.mjs
 */
const origin = (process.env.ODOO_ORIGIN || process.env.LAKECITY_ODOO_ORIGIN || "")
  .trim()
  .replace(/\/+$/, "");
const token = (process.env.LAKECITY_API_TOKEN || "").trim();

if (!origin.startsWith("https://") && !origin.startsWith("http://")) {
  console.error("Set ODOO_ORIGIN (or LAKECITY_ODOO_ORIGIN) to your Odoo base URL.");
  process.exit(1);
}
if (!token) {
  console.error("Set LAKECITY_API_TOKEN to match Odoo system param lakecity_loan.api_token.");
  process.exit(1);
}

const stand = (process.env.STAND_NUMBER || "TEST-99").trim();
const amount = (process.env.AMOUNT || "1.00").trim();
const receiptUrl = (
  process.env.RECEIPT_URL || "https://example.com/receipt-placeholder.pdf"
).trim();

const uuid = `script-test-${Date.now()}`;
const payload = {
  marker: "RECEIPT_CAPTURE_V2",
  uuid,
  timestamp: new Date().toISOString(),
  stand_number: stand,
  receipt_link: receiptUrl,
  receipt_url: receiptUrl,
  amount,
  payer_name: "Script Test",
  payment_method: "Cash",
  payment_date: new Date().toISOString().slice(0, 10),
  entered_by: "test-odoo-receipt-intake.mjs",
  answers: {
    "Stand Number": stand,
    "First Name": "Script",
    "Last Name": "Test",
    "Receipt Date": new Date().toISOString().slice(0, 10),
    Amount: amount,
    "Payment Method": "Cash",
    Receipt: receiptUrl,
    "Receipt Entered by": "test-odoo-receipt-intake.mjs",
  },
};

const url = `${origin}/lakecity/api/v1/receipt/intake`;
console.log("POST", url);
console.log("uuid", uuid);

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
})
  .then(async (r) => {
    const t = await r.text();
    console.log(r.status, t);
    let body = null;
    try {
      body = JSON.parse(t);
    } catch {
      /* ignore */
    }
    if (!r.ok) process.exit(1);
    if (body && body.ok === false) process.exit(1);
    if (body && Array.isArray(body.warnings) && body.warnings.length) {
      console.log("warnings:", JSON.stringify(body.warnings, null, 2));
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
