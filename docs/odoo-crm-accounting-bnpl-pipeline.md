# Odoo pipeline: CRM → Accounting → LakeCity BNPL

This describes how **one contact** (`res.partner`) flows through **CRM**, **Accounting**, and **LakeCity BNPL**, and how the **Collection Schedule CSV** ties in.

## How Odoo sees “customers”

- **Contacts** are **`res.partner`** records.
- **CRM** (Leads & Opportunities) eventually converts to **the same partners** you invoice and collect from.
- **Accounting** → **Customers** lists partners that are flagged as **customers** (in most databases this is the **`customer_rank`** field installed with **Sales** and/or **Accounting**).
- **LakeCity BNPL** (`lakecity.loan.contract`) links each stand to **one `res.partner`** and posts **`lakecity.loan.payment`** lines — these are **not** `account.payment` unless you add a separate integration.

**Order of operations for your business process**

1. **CRM** — visibility, pipeline, tags (who is a prospect/client on the stand).
2. **Accounting** — customer flag, receivables, invoices where you use standard invoicing.
3. **LakeCity BNPL** — BNPL contract, installment schedule, BNPL payment allocation.

The API used by this repo’s import script creates/updates the **partner** when you call **`/lakecity/api/v1/loan/upsert`**. As of **`lakecity_loan_management` 19.0.1.0.3+**, that upsert sets **`customer_rank = 1`** when the field exists, so the contact appears as a **Customer** for Accounting/Invoicing workflows **without a second import**. **19.0.1.0.4+** adds optional **CRM lead first** (see below).

## Recommended apps on the database

Install at minimum:

- **Contacts** (base)
- **CRM** (if you use leads/pipeline)
- **Accounting** (or **Invoicing** / **Sales**, depending on edition) so **customer** semantics exist end-to-end.

## Strict CRM lead first (implemented)

Upgrade **`lakecity_loan_management` to 19.0.1.0.4+** and **upgrade the app** on Odoo.sh (adds **`crm`** dependency).

`POST /lakecity/api/v1/loan/upsert` accepts **`"create_crm_lead_first": true`**. Order is then:

1. **`crm.lead`** — created or reused by `lakecity_contract_external_uid` (= loan `external_uid`).
2. **`res.partner`** — upserted (Accounting **customer** when `customer_rank` exists).
3. **`lakecity.loan.contract`** — upserted as before.
4. Response includes **`crm_lead_id`** when the flag is set.

The import script sends this **by default**; use **`--skip-crm-lead`** to turn it off.

## Automation options

### A) CSV → BNPL (implemented in-repo)

Script: `scripts/import-collection-schedule-csv-to-odoo.mjs`

- Reads your **Collection Schedule** CSV (same columns as the template you use today).
- Calls **`loan/upsert`** then posts **one opening BNPL payment** = **`TOTAL PAID − Deposit`** so totals align with **Current Balance** when the sheet is internally consistent.
- Uses stable **`external_uid`** values: `collection-csv-<STAND>` (rerunnable).

Commands (from repo root):

```bash
# Validate file only (no HTTP)
node scripts/import-collection-schedule-csv-to-odoo.mjs "/path/to/schedule.csv" --parse-only --skip-internal

# Dry-run against Odoo (logs POST bodies; set ODOO_ORIGIN + LAKECITY_LOAN_API_TOKEN)
node --env-file=.env scripts/import-collection-schedule-csv-to-odoo.mjs "/path/to/schedule.csv" --dry-run

# Live import (after Odoo backup). CRM lead is created first unless you add --skip-crm-lead
node --env-file=.env scripts/import-collection-schedule-csv-to-odoo.mjs "/path/to/schedule.csv" --skip-internal
```

Environment: **`ODOO_ORIGIN`**, **`LAKECITY_LOAN_API_TOKEN`** (must match **Settings → Technical → Parameters → `lakecity_loan.api_token`**).

### B) CRM tagging after BNPL (optional, UI)

1. Create a **Partner tag** (e.g. “Collection / LakeCity”).
2. **Automated Action** (developer mode): on `res.partner` create/write where **Stand** or **email domain** matches your rules → add tag — *or* mass-edit after import.

### C) Manual “import leads only” (avoid if using automated CRM-first BNPL)

Duplicating **CRM → Import** and this script for the same people risks **duplicate partners**. Prefer **one** path: this repo’s CSV import (CRM lead created inside **`loan/upsert`**), or a custom flow documented with your team.

## Balance truth from the CSV

The CSV columns **TOTAL PRICE**, **TOTAL PAID**, and **Current Balance** should satisfy:

**TOTAL PRICE ≈ TOTAL PAID + Current Balance** (allow small rounding).

The script warns when **TOTAL PAID** disagrees with **TOTAL PRICE − Current Balance**. Fix the sheet row before a live import if the delta is large.

## Upgrade note

Deploy addon **`lakecity_loan_management` ≥ 19.0.1.0.4** on Odoo.sh for **CRM-first** imports and **`crm`** dependency.
