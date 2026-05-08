# Internal Odoo audit page

A new internal-only page at `/internal/odoo-audit` lets staff verify that Odoo writes are reaching Supabase. Customers can never see this page (it requires `internal_users.role` IN `('admin','super_admin','director','internal')`).

## Code shipped in this PR

- `supabase/functions/odoo-audit-data/index.ts` — read-only feed:
  - last 50 `payment_receipts` with an Odoo origin
  - 24h reconciliation counts (DB receipts vs. Odoo paid lines)
  - drift sample: lines paid in Odoo with no matching DB row
  - `internal_users.role` gate; returns 403 for everyone else
- `src/pages/internal/OdooAuditPage.tsx` — TanStack Query client with auto-refresh every 60s, KPI cards, drift table, recent-syncs table.
- `src/App.tsx` — adds `/internal/odoo-audit` route.
- `supabase/config.toml` — registers `odoo-audit-data` (verify_jwt = true) plus the four other in-scope edge functions.

## What to look for on the page

### KPI cards (top row)

- **Receipts in DB (24h)**: count of `payment_receipts` created in the last 24 hours, scoped to your tenant.
- **Odoo paid lines (24h)**: count of `lakecity.collection.payment` lines with `is_paid=true AND paid_date >= today-1`. Scoped via Vault config to your tenant's Odoo instance.
- **Variance (24h)**: `Receipts − Odoo paid`. Should be 0 ± 1 in steady state.
- **Pending QC**: count of `payment_receipts` with `qc_status='pending_qc'` — these are receipts Kuva (or staff) submitted that staff hasn't approved in Odoo yet.

### "Paid in Odoo, not yet in Supabase"

This table is the cutover's smoke alarm. Every row here means a payment that staff confirmed in Odoo never made it back to the customer portal — i.e., the webhook dropped or hasn't fired.

- Empty list = green.
- 1–3 rows = check `odoo-webhook` logs in Lovable Cloud for the matching `_id` and re-trigger from Odoo (Settings → Technical → Automation Rules → Run on records).
- 5+ rows or growing across refreshes = page the on-call. Likely causes: webhook URL changed, bearer token rotated without updating Odoo System Parameters, network blip on Odoo.sh.

### "Last 50 Odoo-origin receipts"

The forensic log. Each row shows what came through and how it was tagged:

- `Sync` column = `odoo_sync_status`. Common values:
  - `synced` — webhook applied; receipt is the canonical record.
  - `pending_qc_in_odoo` — `odoo-sync-payment` linked the Kuva receipt to an Odoo line; staff hasn't approved yet.
  - `no_match` — `odoo-sync-payment` couldn't find a matching `lakecity.collection.payment` line. Investigate the schedule in Odoo.
- `Odoo Line` shows `#<id>` for the new path; legacy entries (`legacy #<id>`) point at the older `account.payment` records from before cutover.

## Access

1. Sign in via `/internal-login`.
2. Navigate directly to `/internal/odoo-audit` — the page is not yet linked from `/internal-portal`. (Optional follow-up: add a link card to `InternalPortal.tsx` once the cutover is stable for 7 days.)
3. The page will redirect you to `/internal-portal` if your role is not in the allowed set.

## Test plan

In staging:

1. Sign in as an admin user.
2. Open `/internal/odoo-audit`. Confirm:
   - KPI cards render with reasonable numbers (likely 0/0 in fresh staging).
   - "Paid in Odoo, not yet in Supabase" is empty.
   - "Last 50 Odoo-origin receipts" shows at minimum the test receipt from Step 6's smoke test.
3. Sign in as a regular customer → navigate to `/internal/odoo-audit` directly → confirm you get redirected away (not allowed).
4. Trigger a deliberate drift: in Odoo, set `amount_paid` on a payment line, then comment out the automation rule's POST step temporarily and save. Refresh the audit page; the drift table should now show that line. Re-enable the rule and "Run on records" → drift should clear within 60 seconds.

## Sign-off

- [ ] `/internal/odoo-audit` renders for admin users in staging.
- [ ] Returns 403 / redirects for non-internal users.
- [ ] All three sections populate correctly.
- [ ] Drift detection verified end-to-end with the deliberate-drift test.

Proceed to [09-production-cutover.md](09-production-cutover.md).
