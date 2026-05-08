# Odoo CRM Cutover (Lake City)

Operator-facing runbooks and helper scripts for the Sheets→Odoo cutover. Each numbered file maps to a step in `.cursor/plans/odoo_crm_cutover_plan_*.plan.md`.

## Reading order

| # | Doc | Purpose | Hands-on time |
|---|---|---|---|
| 01 | [01-staging-environment.md](01-staging-environment.md) | Remix Lovable; create Odoo.sh staging branch; seed sanitized data | 45 min |
| 02 | [02-preflight.md](02-preflight.md) | Backups, snapshots, audit Sheet usage | 30 min |
| 03 | [03-deploy-addon.md](03-deploy-addon.md) | Build `release/odoo-cutover`; install addon on Odoo.sh prod | 30 min |
| 04 | [04-vault.md](04-vault.md) | Rename Vault secrets to UUID suffix; add `odoo_webhook_secret` | 5 min |
| 05 | [05-import-history.md](05-import-history.md) | XLSX wizard import; spot-check 10 stands | 30–60 min |
| 06 | [06-reverse-sync.md](06-reverse-sync.md) | Configure two Odoo automation rules; verify webhook | 20 min |
| 07 | [07-cutover-functions.md](07-cutover-functions.md) | Code changes for `odoo-sync-payment` and `generate-monthly-statements` | review only |
| 08 | [08-audit-page.md](08-audit-page.md) | Internal `/internal/odoo-audit` page | review only |
| 09 | [09-production-cutover.md](09-production-cutover.md) | The 90-min go-live runbook | 90 min |
| 10 | [10-monitor.md](10-monitor.md) | 7-day observability checklist | 10 min/day for 7 days |
| 11 | [11-decommission-sheets.md](11-decommission-sheets.md) | Final Sheet retirement after 30 clean days | 60 min |

## Helper scripts

In `scripts/cutover/`:

| Script | When to run |
|---|---|
| `audit-sheets-usage.sh` | Pre-flight, to confirm the Sheet inventory matches what the docs expect. |
| `prepare-release-branch.sh` | Step 3, builds `release/odoo-cutover` cleanly off `origin/main`. |
| `sample-stands-for-spotcheck.py` | Step 5, picks 10 random stands across all term-length tabs. |
| `smoke-test-prod.sh` | Step 9 §7, one-shot post-deploy smoke test of the in-scope edge functions. |
| `rollback.sh` | Step 9 emergency, reverts the cutover PR and prompts for the manual follow-ups. |
| `run-daily-reconciliation.sh` | Step 10, wraps the SQL queries with a single PASS/FAIL summary for cron. |
| `decommission-sheets.sh` | Step 11, automates the routing-removal portion of the decommission. |

## Helper SQL

In `docs/sql/`:

| File | Purpose |
|---|---|
| `lakecity-odoo-vault-rename-and-webhook.sql` | Step 4, renames slug-suffixed Vault secrets to UUID and adds the webhook bearer. |
| `cutover-monitoring.sql` | Step 10, daily reconciliation queries. |

## Code changes shipped on `release/odoo-cutover`

- New: migration `20260507010000_payment_receipts_odoo_collection_payment.sql`.
- New: edge function `supabase/functions/odoo-audit-data/index.ts`.
- New: page `src/pages/internal/OdooAuditPage.tsx` + route in `src/App.tsx`.
- Modified: `supabase/functions/odoo-webhook/index.ts` — handles `lakecity.collection.payment` and `lakecity.collection.schedule`.
- Modified: `supabase/functions/odoo-sync-payment/index.ts` — links Kuva receipts to `lakecity.collection.payment` lines.
- Modified: `supabase/functions/generate-monthly-statements/index.ts` — default `source` flipped to `database`; resolves `tenant_id` from JWT when omitted.
- Modified: `supabase/config.toml` — registers the five Odoo edge functions.

Plus all of `docs/cutover/`, `scripts/cutover/`, `docs/sql/lakecity-odoo-vault-rename-and-webhook.sql`, and `docs/sql/cutover-monitoring.sql`.

## What's deliberately NOT shipped

Per the cutover plan's "Deferred" list:

- `lakecity_loan_management` Odoo addon, `_shared/odoo-loan-api.ts`, `odoo-loan-module-sync` edge function.
- BNPL v2 migrations (`20260409070000`–`20260409075000`).
- New payment orchestration webhooks (paystack, flutterwave, paypal, router, handler).
- `crm-app-api`, `run-v2-reconciliation`.
- The customer-visible `/odoo-accounting` route in `src/App.tsx` (kept on `wip/local-v2-and-docs`; the underlying `odoo-accounting-data` edge function ships, but no UI route on `main`).
