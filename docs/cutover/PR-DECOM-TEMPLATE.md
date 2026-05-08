# Decommission Google Sheets after 30-day clean window

## Summary

After 30 consecutive days of clean post-cutover monitoring (zero ticket regressions, zero `/internal/odoo-audit` drift > ±1, zero idempotency dupes), this PR retires the legacy Google Sheets integration:

- Removes the eight Sheet-only edge functions from `supabase/config.toml`.
- Migrates the six Sheet-read edge functions (`lookup-stand-email`, `request-password-reset`, `internal-portal-access`, `manage-user-access`, `check-reporting-access`, `validate-signup`, `verify-signup-otp`) to Postgres-only queries.
- Removes `supabase/functions/_shared/collection-schedule-sheets.ts` and its frontend equivalent `src/lib/collection-schedule.ts`.
- Updates docs to point at the Odoo runbook instead of the Sheet runbook.

Function code remains in the repo for one more month (the rollback window) but is no longer routed by Lovable Cloud.

## Out of scope

- The spreadsheet itself (archived manually as part of the cutover).
- Env vars in Lovable Cloud (deleted manually as part of the cutover).
- Frontend pages that still call `fetch-google-sheets` (separate PR).

## Test plan

- [ ] All migrated functions work against staging DB-only data; spot-checked.
- [ ] Smoke test on production staging copy: stand→email lookup, password reset flow, internal portal staff search, validate-signup, verify-signup-otp.
- [ ] CI green; no broken imports of `_shared/collection-schedule-sheets`.
- [ ] `/internal/odoo-audit` still works as expected (no dependency on Sheets).
- [ ] Grep for `fetch-google-sheets` and `googleapis.com` returns no hits in supabase/functions/ (allowed in src/ pages until follow-up PR).
