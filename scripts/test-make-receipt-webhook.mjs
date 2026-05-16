#!/usr/bin/env node
/**
 * POST a sample receipt payload to Make (Custom webhook) for smoke-testing the chain.
 *
 *   MAKE_WEBHOOK_URL=https://hook.us2.make.com/... node scripts/test-make-receipt-webhook.mjs
 *
 * Or: node --env-file=.env scripts/test-make-receipt-webhook.mjs
 *     (expects MAKE_WEBHOOK_URL in .env)
 */
const url = (process.env.MAKE_WEBHOOK_URL || "").trim();
if (!url.startsWith("https://")) {
  console.error("Set MAKE_WEBHOOK_URL to your Make Custom webhook (https://…).");
  process.exit(1);
}

const payload = {
  uuid: `script-test-${Date.now()}`,
  timestamp: new Date().toISOString(),
  answers: {
    "Stand Number": "TEST-99",
    "First Name": "Script",
    "Last Name": "Test",
    "Receipt Date": new Date().toISOString().slice(0, 10),
    Amount: "1.00",
    "Payment Method": "Cash",
    Receipt: "https://example.com/receipt-placeholder.pdf",
    "Receipt Entered by": "test-make-webhook.mjs",
  },
};

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
})
  .then(async (r) => {
    const t = await r.text();
    console.log(r.status, t);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
