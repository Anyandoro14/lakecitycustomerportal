# Odoo CRM cutover (Step 2–7)

## Summary

Lands the `lakecity_crm` Odoo addon, the supporting Supabase edge functions, and the Sheets→Odoo cutover plumbing on `main`. **No customer-visible changes** — the portal continues to read from the same Postgres tables, but those tables are now fed by Odoo via webhook instead of by spreadsheet edits.

### What this PR adds

- `odoo/addons/lakecity_crm/` — Odoo 19 module mirroring the Collection Schedule spreadsheet.
- `supabase/functions/odoo-push-schedule/` — pushes new contracts into Odoo (forward sync).
- `supabase/functions/odoo-accounting-data/` — read-only finance KPIs (no UI route on `main`; internal-only audit page consumes it).
- `supabase/functions/odoo-audit-data/` — read-only feed for the new internal `/internal/odoo-audit` page.
- `src/pages/internal/OdooAuditPage.tsx` — gated behind `profiles.role IN ('admin','internal')`.

### What this PR changes

- `supabase/functions/odoo-webhook/index.ts` — extended to handle `lakecity.collection.payment` and `lakecity.collection.schedule` events; upserts into `payment_receipts` / `contracts`.
- `supabase/functions/odoo-sync-payment/index.ts` — posts to `lakecity.collection.payment` instead of `account.payment`.
- `supabase/functions/generate-monthly-statements/index.ts` — default `source` flipped from `sheets` to `database`.

### Migrations

- `20260506230000_contracts_odoo_schedule_id.sql` — adds nullable `contracts.odoo_schedule_id INTEGER` with a partial index. Backwards-compatible.

### Out of scope (NOT included)

- `lakecity_loan_management` Odoo addon and `_shared/odoo-loan-api.ts`.
- BNPL v2 migrations (`20260409070000`–`20260409075000`).
- Payment orchestration webhooks (paystack, flutterwave, paypal, router, handler).
- `crm-app-api` standalone CRM API.
- `run-v2-reconciliation`, `odoo-loan-module-sync`.
- The customer-visible `/odoo-accounting` route (kept on `wip/local-v2-and-docs`).

## Test plan

- [ ] Tested in staging Lovable Cloud + staging Odoo.sh branch end-to-end.
- [ ] Migration applied cleanly to staging Supabase.
- [ ] Edge function deploys all returned 2xx in Lovable Cloud deploy log.
- [ ] Internal audit page accessible to admin role; returns 403 for normal users.
- [ ] Smoke-tested with the cutover plan's customer-side checks (3 portal logins, every visible number unchanged from before cutover).
- [ ] Smoke-tested by posting a test payment in staging Odoo and verifying it appears in `payment_receipts` within 30 seconds, and shows on the customer portal.

## Rollback

If anything breaks after merge:

1. Revert this PR in GitHub (creates a revert commit).
2. Re-enable spreadsheet edits in Google Drive.
3. Disable Odoo automation rules so `odoo-webhook` stops writing to `payment_receipts`.
4. Customer portal continues to function — no customer-side rollback needed.
