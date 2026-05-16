#!/usr/bin/env node
/**
 * Sanity check ODOO_ORIGIN + LAKECITY_LOAN_API_TOKEN (same as Odoo lakecity_loan.api_token).
 *
 *   node --env-file=.env scripts/odoo-bnpl-health.mjs
 */
const o = (process.env.ODOO_ORIGIN || "").trim().replace(/\/$/, "");
const tok = (process.env.LAKECITY_LOAN_API_TOKEN || "").trim();

if (!o.startsWith("https://")) {
  console.error("ODOO_ORIGIN must start with https:// (got:", JSON.stringify(o) || "(empty)");
  process.exit(1);
}
if (!tok || /^PASTE_/i.test(tok) || /^REPLACE_/i.test(tok)) {
  console.error("Set LAKECITY_LOAN_API_TOKEN in .env to the Odoo parameter lakecity_loan.api_token value (not a placeholder).");
  process.exit(1);
}

const url = `${o}/lakecity/api/v1/health`;
fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
  .then(async (r) => {
    const t = await r.text();
    console.log(r.status, t);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
