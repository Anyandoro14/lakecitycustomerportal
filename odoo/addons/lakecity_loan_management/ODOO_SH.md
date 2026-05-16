# Odoo.sh setup (Odoo 19)

This addon is built for Odoo 19 and deploys normally on Odoo.sh.

## 1) Addon path

Ensure this repo path is available in your Odoo.sh build:

- `odoo/addons/lakecity_branding`
- `odoo/addons/lakecity_loan_management`

## 2) Install module

1. Update Apps List.
2. Install **Inventory** (Stock) and **Sales** if not already present.
3. Install **Lakecity BNPL Loan Management** (pulls in **LakeCity Branding** for ERP + login visuals, plus **Stock** and **Sales** for stand SKUs).

Standalone theming-only: install **LakeCity Branding** without BNPL where appropriate.

## 3) Configure API token

Set Odoo system parameter:

- `lakecity_loan.api_token=<strong_random_secret>`

This token is required by all `/lakecity/api/v1/*` endpoints.

## 4) Network/security

- Keep Odoo.sh URL in Supabase Vault as `odoo_url_<tenant_id>`.
- Keep API token in Supabase Vault as `odoo_loan_api_token_<tenant_id>`.
- Use HTTPS only.

## 5) Bulk import from Supabase (go-live migration)

Historical **contracts** become `lakecity.loan.contract` rows; **`external_uid`** is the Supabase `contracts.id`.  
Approved **`payment_receipts`** (`qc_status = 'approved'`) are posted as **`lakecity.loan.payment`** with **`external_uid`** = receipt `id` (idempotent reruns).

In this repo root (with `@supabase/supabase-js` already in `package.json`):

1. Append to `.env` (do **not** commit the service role key):

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` — service role bypasses RLS for a one-off admin migration  
   - `ODOO_ORIGIN` — production base URL, no trailing slash, e.g. `https://<project>.odoo.com`
   - `LAKECITY_LOAN_API_TOKEN` — exact match to Odoo parameter `lakecity_loan.api_token`

   Optional: `TENANT_SLUG=lakecity` (default); `SKIP_PREFLIGHT=1` skips Odoo `GET /health` (not recommended); `MIGRATE_ODOO_RETRIES` (default `4`) for transient 429/502/503. Finish partial runs despite row errors: `MIGRATE_CONTINUE_ON_ERROR=1`.

2. Connectivity check (recommended): **`pnpm run migrate:odoo-bnpl:preflight`** (`--preflight-only`).

3. Dry run (logs only): **`pnpm run migrate:odoo-bnpl:dry-run`** or `DRY_RUN=1`.

4. Back up Odoo DB (Odoo.sh backup), then **`pnpm run migrate:odoo-bnpl`** (or `npm run …`).

CLI flags mirror env: **`--dry-run`**, **`--preflight-only`**, **`--skip-preflight`**.

**Balances:** Odoo derives **`current_balance`** from **total − deposit − posted payments**. Supabase **`contract_balances`** is informational; reconcile a few stands after import. **`monthly_installment`** in Supabase may differ slightly from **`recurring_invoice_amount`** due to VAT/rounding formulas in Odoo.

**Collection Schedule CSV → BNPL:** See `docs/odoo-crm-accounting-bnpl-pipeline.md` and `scripts/import-collection-schedule-csv-to-odoo.mjs` (opening totals from **TOTAL PAID** / **Current Balance**).
