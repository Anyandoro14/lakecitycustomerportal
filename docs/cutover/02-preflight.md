# Pre-flight Checklist

Run **before** any cutover code lands on `main`. The goal is a clean rollback point: a complete backup of Supabase, a frozen snapshot of the Collection Schedule spreadsheet, and a verified inventory of every code path that touches Google Sheets.

> **Time required**: ~30 minutes.

## 1. Supabase backup (production)

Lovable Cloud takes daily backups automatically. Verify the most recent one ran today and trigger a manual point-in-time backup before cutover:

1. Open production Lovable Cloud → **Database** → **Backups**.
2. Confirm a backup with today's date exists.
3. Click **Create backup now** to trigger an extra one.
4. Note the timestamp; this is your rollback point if anything goes wrong.

If you also want a local copy:

```bash
# From your laptop, with the prod connection string
pg_dump "$PROD_DB_URL" \
  --schema=public \
  --no-owner --no-privileges \
  --format=custom \
  > "/tmp/lake-city-prod-$(date +%Y%m%d-%H%M).dump"
```

Store this file somewhere durable (e.g. encrypted iCloud / Google Drive folder).

## 2. Collection Schedule spreadsheet snapshot

The spreadsheet is the historical source of truth for every paid receipt prior to cutover. We need a frozen copy.

1. Open the **Collection Schedules - Customer Portal** Google Sheet.
2. **File → Make a copy** → name it `Collection Schedule — Pre-Cutover Snapshot YYYY-MM-DD`. Save in a Drive folder you control.
3. **File → Download → Microsoft Excel (.xlsx)** to your laptop. Keep alongside the SQL dump.
4. Optionally, also download every tab as separate `.xlsx` for the XLSX wizard import (Odoo's wizard takes one file per import run):
   - File → Download → Microsoft Excel — but Google's export only includes the active sheet's data per tab when you split. Easier: use the helper script below.

Quick split-by-tab script (run from your laptop, requires `gspread` in `.venv-xlsx/`):

```bash
source .venv-xlsx/bin/activate
python docs/payment-schedule-templates/sync_templates_from_reference.py --export-snapshot \
  --output /tmp/lake-city-snapshot/ \
  --sheet-id "$COLLECTION_SCHEDULE_SHEET_ID"
```

If that script doesn't have an `--export-snapshot` mode yet, use the simpler workaround:

```bash
mkdir -p /tmp/lake-city-snapshot
# Manually download each tab as .xlsx via Google Sheets UI:
#   File → Download → Microsoft Excel (after temporarily hiding all other tabs).
# Place each file in /tmp/lake-city-snapshot/ named after the tab.
```

## 3. Inventory of Sheet-dependent code

Run the audit script to confirm we know every file that touches Sheets. This catches drift if anyone added a new Sheet caller since the plan was drafted.

```bash
bash scripts/cutover/audit-sheets-usage.sh > /tmp/sheets-audit.txt
cat /tmp/sheets-audit.txt
```

Compare the output to the expected list below. If there are extras, add them to the cutover plan before proceeding.

### Expected Sheet-touching files (as of 2026-05-07)

**Edge functions calling Google Sheets API directly:**

- `supabase/functions/_shared/collection-schedule-sheets.ts` (helper)
- `supabase/functions/fetch-google-sheets/index.ts` — bulk reader, used by 4 portal pages
- `supabase/functions/lookup-stand-email/index.ts` — password reset stand→email
- `supabase/functions/request-password-reset/index.ts` — same
- `supabase/functions/internal-portal-access/index.ts` — staff search
- `supabase/functions/manage-user-access/index.ts` — admin user management
- `supabase/functions/check-reporting-access/index.ts` — reporting gate
- `supabase/functions/process-approved-receipts/index.ts` — QC receipt → schedule write
- `supabase/functions/incoming-message-webhook/index.ts` — Receipts_Intake updates
- `supabase/functions/backfill-registration-status/index.ts` — registration cell writes
- `supabase/functions/rebuild-payments-from-sheet7/index.ts` — Sheet 7 maintenance
- `supabase/functions/scan-combined-deposits/index.ts` — diagnostics
- `supabase/functions/write-cell/index.ts`, `clear-cell/index.ts`, `fix-payment-cell/index.ts` — cell ops
- `supabase/functions/generate-monthly-statements/index.ts` — has both Sheet and DB modes
- `supabase/functions/validate-signup/index.ts` — verifies stand exists in Sheet
- `supabase/functions/verify-signup-otp/index.ts` — same
- `supabase/functions/fetch-reporting-data/index.ts` — reads Sheet for reports
- `supabase/functions/fetch-registration-stats/index.ts` — counts Sheet rows
- `supabase/functions/send-platform-report/index.ts` — Sheet-driven report
- `supabase/functions/send-article-email/index.ts` — uses Sheet-derived list

**Frontend pages that invoke `fetch-google-sheets`:**

- `src/pages/Index.tsx`
- `src/pages/LookingGlassView.tsx`
- `src/pages/AgreementOfSaleDocuments.tsx`
- `src/pages/StandLedgerLanding.tsx`

**Helper / docs (read-only, no API calls):**

- `src/lib/collection-schedule.ts` — shared tab name constants
- `src/pages/docs/DocsSheets.tsx`, `DocsHome.tsx`, `DocsDataModels.tsx`, `DocsErrors.tsx` — documentation pages

If `audit-sheets-usage.sh` finds files outside this list, decide per file:
- **Block cutover**: it's customer-visible and we hadn't planned for it.
- **Add to retire list**: it's an internal tool, we can disable it as part of cutover.
- **Ignore**: it's a doc/marketing page that mentions Sheets in copy only.

## 4. Confirm Lovable Cloud `main` deploys cleanly

Before merging cutover work into `main`, verify `main` is currently green.

1. Lovable Cloud → **Edge functions** tab. Spot-check a recent deploy log; confirm no failures.
2. Lovable Cloud → **Database** → **Migrations**. Confirm latest migration timestamp matches what's in `supabase/migrations/`.
3. Open production portal in incognito → log in as a known test customer → confirm dashboard renders.

If anything is broken on `main` already, fix that first. **Do not** add cutover work on top of a red `main`.

## 5. Communicate the freeze window to the internal team

Before the production cutover (Step 8 in the plan), the internal team must stop posting to the spreadsheet. Send this Slack/WhatsApp message at least 24 hours before:

> **Lake City portal cutover — DD MMM**
>
> Between [start time] and [end time] we are migrating the Collection Schedule from Google Sheets to Odoo. During this window:
>
> - **Do not** post any payments or new sales to the Collection Schedule spreadsheet.
> - **Do not** approve receipts in the portal.
> - The customer portal will continue to work normally for customers — they will see no change.
> - After the window, you will use **Odoo** for everything you used to do in the spreadsheet.
>
> Training session: [link]. Runbook: [link to track-b-odoo-sh-and-database.md].

## 6. Sign-off

Pre-flight is complete when:

- [ ] Supabase backup taken today and noted with timestamp.
- [ ] `pg_dump` snapshot stored in a durable location.
- [ ] Collection Schedule spreadsheet copy saved in Drive AND downloaded to laptop.
- [ ] Per-tab .xlsx files staged in `/tmp/lake-city-snapshot/` for the import wizard.
- [ ] `audit-sheets-usage.sh` output matches expected list (or deltas accepted).
- [ ] Lovable Cloud `main` confirmed green.
- [ ] Internal team freeze window communicated.

Proceed to [03-deploy-addon.md](03-deploy-addon.md).
