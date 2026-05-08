# Decommission Google Sheets

After 30 consecutive clean days post-cutover, retire the Sheet-only edge functions, archive the Collection Schedule spreadsheet, and clean up the leftover code/env vars/docs. This is a separate PR (`chore/decommission-sheets`) — not part of the cutover PR — so it can be reviewed in isolation and reverted independently.

> **Pre-condition**: 30 consecutive days where:
> - Daily reconciliation (Step 10) PASSed.
> - Zero customer support tickets attributable to the cutover.
> - `/internal/odoo-audit` showed variance ≤ ±1 every check.

## Branch + PR

```bash
git checkout main
git pull origin main
git checkout -b chore/decommission-sheets
bash scripts/cutover/decommission-sheets.sh    # makes the changes below
git status                                      # review
git commit -am 'Decommission Google Sheets after 30-day clean window'
git push origin chore/decommission-sheets
gh pr create --base main --head chore/decommission-sheets \
  --title 'Decommission Google Sheets after 30-day clean window' \
  --body "$(cat docs/cutover/PR-DECOM-TEMPLATE.md)"
```

## Code changes the script applies

### 1. Remove Sheet-only edge function entries from `supabase/config.toml`

Function code stays in `supabase/functions/<name>/` for emergency rollback (one more month), but the entry is removed from `config.toml` so Lovable Cloud stops routing to them:

- `process-approved-receipts`
- `incoming-message-webhook`
- `backfill-registration-status`
- `rebuild-payments-from-sheet7`
- `scan-combined-deposits`
- `write-cell`
- `clear-cell`
- `fix-payment-cell`

(These are the pure Sheet-write tools. Read-side functions like `lookup-stand-email` are migrated to DB queries below, not removed.)

### 2. Migrate Sheet-read functions to DB-only

For each, the script replaces the Sheet path with a Postgres query and removes the `_shared/collection-schedule-sheets.ts` import:

| Function | New behaviour |
|---|---|
| `lookup-stand-email` | `select email from profiles where stand_number = ?` |
| `request-password-reset` | Same — single DB hop, no Sheet fallback. |
| `internal-portal-access` | Reads `profiles` for stand→customer lookups. |
| `manage-user-access` | Reads `profiles` + `internal_users`. |
| `check-reporting-access` | Reads `internal_users.reporting_access` directly. |
| `validate-signup` | `select 1 from profiles where stand_number = ? and email is null` (or whatever the original gate was). |
| `verify-signup-otp` | Same DB-only validation. |

After migration, `_shared/collection-schedule-sheets.ts` is deleted along with `src/lib/collection-schedule.ts` and references purged.

### 3. Frontend pages that were calling `fetch-google-sheets`

These pages were internal/admin and not customer-facing. Either delete them or convert to read from `contracts` / `payment_receipts`:

- `src/pages/Index.tsx` — if no remaining Sheet calls remain after edit, leave alone.
- `src/pages/LookingGlassView.tsx` — convert to DB queries against `contracts`/`profiles`.
- `src/pages/AgreementOfSaleDocuments.tsx` — convert to DB queries.

### 4. Archive the spreadsheet

Manual step (the script can't do this):

1. Open the Collection Schedule spreadsheet.
2. **File → Move → Archive/2026/Lake-City-Collection-Schedule-Final-Snapshot/**.
3. Add a note in cell A1 of every tab: `ARCHIVED YYYY-MM-DD - source of truth is now Odoo (lakecity.collection.schedule). Read-only.`
4. Lock the spreadsheet to view-only for everyone (Share → revoke all editor access including yourself).

### 5. Delete obsolete env vars

In Lovable Cloud → Edge Function Secrets, delete:

- `GOOGLE_SERVICE_ACCOUNT_JSON` (or whatever name it goes by)
- `COLLECTION_SCHEDULE_SHEET_ID`
- Any other `*SHEET*ID*` or `GOOGLE_*` not used by remaining functions.

If any Sheet-touching function in the rollback set still depends on these vars, hold off until the rollback window expires (60 days post-cutover).

### 6. Update docs

- `docs/STANDLEGER_ARCHITECTURE.md` — note that Sheets are archived; Odoo is source of truth.
- `src/pages/docs/DocsSheets.tsx` — replace contents with a one-liner: "Sheet integration retired YYYY-MM-DD. See docs/odoo-partner-onboarding/." Or remove from `App.tsx`.
- Move `docs/cutover/` to `docs/cutover-archive/2026-05-cutover/` (preserves the runbooks for future reference) — optional, can stay in `docs/cutover/` if useful for v2 cutovers.

### 7. Final cleanup of cutover artifacts

After this PR merges, the cutover is "done":

```bash
# Optional: delete branches that were created during cutover
git branch -D release/odoo-cutover wip/local-v2-and-docs
git push origin --delete release/odoo-cutover wip/local-v2-and-docs
```

## Rollback (only relevant during the cutover window itself)

If something breaks **during** the cutover (Steps 1–9 of the production runbook, before Step 10 monitoring starts):

1. `bash scripts/cutover/rollback.sh` reverts the cutover PR.
2. Lovable Cloud redeploys the previous main; edge functions go back to Sheet-mode.
3. Manually deactivate the two Odoo automation rules (the script reminds you).
4. Re-share the spreadsheet with edit access.
5. Customer portal is unaffected throughout — no customer-side rollback needed.

This rollback expires on Day 31, when Sheet-only functions are removed from `config.toml`. After that, rollback is impossible without a manual re-deploy of the deleted code from git history.

## Sign-off

- [ ] 30-day clean window confirmed.
- [ ] `chore/decommission-sheets` PR opened and reviewed.
- [ ] Sheet-only edge functions removed from `config.toml`.
- [ ] Sheet-read functions migrated to DB-only and tested.
- [ ] Spreadsheet archived and locked.
- [ ] Obsolete env vars deleted.
- [ ] Docs updated.
- [ ] PR merged. Cutover formally complete.
