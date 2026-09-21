# LakeCity receipts: Make.com → Odoo (**deprecated**)

> **Primary path is Make-free.** See **[`receipt-intake-google-form-odoo.md`](./receipt-intake-google-form-odoo.md)**  
> and **[`scripts/google-forms/README.md`](../scripts/google-forms/README.md)**.

Make.com (Custom webhook → HTTP Odoo → Gmail → Twilio) is **deprecated**. Keep this file only for rollback context.

### Rollback (temporary)

1. Apps Script: `SUBMIT_TARGET=make` + `MAKE_WEBHOOK_URL` = your Custom webhook.
2. Re-enable the Make scenario.
3. Prefer switching back to `SUBMIT_TARGET=odoo` as soon as ops confirms email/SMS from Apps Script / Odoo.

### Historical notes

- Endpoint and JSON field mapping are unchanged; documented in the Make-free guide.
- Legacy smoke: `MAKE_WEBHOOK_URL=… node scripts/test-make-receipt-webhook.mjs`
- Prefer: `ODOO_ORIGIN=… LAKECITY_API_TOKEN=… node scripts/test-odoo-receipt-intake.mjs`
