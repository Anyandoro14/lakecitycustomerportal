# Weekly balance reconciliation

Every **7 days** (Monday 06:00 CAT / 04:00 UTC) LakeCity compares customer **sale price, deposit, total paid, and current balance** across three ledgers and emails a discrepancy table.

| Source | What is pulled | Typical cause when it is the odd one out |
|--------|----------------|------------------------------------------|
| **Master Sales (Google Sheets)** | Dedicated workbook [Master Sales](https://docs.google.com/spreadsheets/d/1LipmKyODkB9cBmQXCy1gd8tBcxhz6aO0/edit?gid=1904118601) (`1LipmKyODkB9cBmQXCy1gd8tBcxhz6aO0`, gid `1904118601`). Share this file with the Google service account. | Payment posted on the sheet but not in Odoo/portal, or a formula/deposit edit on the sheet |
| **Odoo** | `GET /lakecity/api/v1/loan/list` — `total_with_tax`, `deposit_amount`, `total_paid`, `current_balance` | Contract never upserted, receipt sync skipped (pre-cutover / QC), or VAT inclusive vs exclusive price |
| **StandLedger** | Customer-facing Collection Schedule when a Master Sales tab exists; otherwise portal `contract_balances` (approved `payment_receipts`). If that view is empty, Collection Schedule is used (same figures customers see on the dashboard) | Approved portal receipts not written to the sheet, or sheet amounts not imported as `payment_receipts` |

## Sign convention

Discrepancy = **left − right**.

- **Positive** (orange): left outstanding is **higher** — the customer appears to owe more on that source.
- **Negative** (rose): left outstanding is **lower** — the customer appears to owe less on that source.

Columns in the email: Sheets − Odoo, Sheets − StandLedger, Odoo − StandLedger, plus a **likely cause** sentence (deposit, receipts, sale price, missing stand).

## Run it

Staff (Director / Super Admin): **Internal nav → Reconciliation → Run now and email report**.

Manual / cron:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-account-balances" \
  -H "Authorization: Bearer $RECONCILIATION_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sendEmail":true,"source":"manual"}'
```

`dryRun: true` compares without writing rows or sending email.

## Secrets and Vault

| Name | Where | Purpose |
|------|--------|---------|
| `GOOGLE_CLIENT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_KEY` | Edge Function env | Read Master Sales / Collection Schedule |
| `SPREADSHEET_ID` | Env (fallback) | Collection Schedule workbook if `tenants.spreadsheet_id` is empty |
| `MASTER_SALES_SPREADSHEET_ID` | Optional env | Defaults to `1LipmKyODkB9cBmQXCy1gd8tBcxhz6aO0` |
| `MASTER_SALES_SHEET_GID` | Optional env | Defaults to `1904118601` (the Master Sales tab) |
| `MASTER_SALES_SHEET_TAB` | Optional env | Exact tab title if the gid is renamed |
| `odoo_url_<tenant_id>` / `odoo_loan_api_token_<tenant_id>` | Vault | Odoo list API (`ODOO_ORIGIN` / `LAKECITY_LOAN_API_TOKEN` env fallback) |
| `RESEND_API_KEY` | Edge Function env | Send the HTML table |
| `RECONCILIATION_REPORT_EMAILS` | Optional env | Comma-separated recipients (default `accounts@lakecity.co.zw,alex@lakecity.co.zw`) |
| `RECONCILIATION_FROM_EMAIL` | Optional env | From address (default `LakeCity <noreply@lakecity.co.zw>`) |
| `RECONCILIATION_CRON_SECRET` | Edge Function env **and** Vault `reconciliation_cron_secret` | Bearer token for pg_cron / GitHub Actions |

Odoo addon **`lakecity_loan_management` 19.0.1.0.69+** is required for `/lakecity/api/v1/loan/list`. Sync addons to Standledger and upgrade the module.

## Schedule

Migration `20260908120000_balance_reconciliation.sql` creates history tables and a `pg_cron` job `weekly-balance-reconciliation` that POSTs the Edge Function. The job no-ops until Vault contains `reconciliation_cron_secret`.

GitHub Actions `.github/workflows/weekly-balance-reconciliation.yml` is an optional backup (`workflow_dispatch` + Monday cron). Add repository secrets `SUPABASE_URL` and `RECONCILIATION_CRON_SECRET`.

## History tables

- `balance_reconciliation_runs` — one row per run (counts, email flag, notes)
- `balance_reconciliation_rows` — per-stand amounts and likely cause

Internal users can `SELECT` these tables (RLS). Writes are service-role only.
