# Lakecity BNPL Loan Management (Odoo)

Developer-facing notes for this addon. This file is intentionally **not** named `README.md`: Odoo’s manifest loader treats `README.md` as the module description when the manifest omits `description`, and Markdown is parsed through docutils as RST, which spuriously logs `Unexpected indentation` during builds.

This module provides a dedicated loan engine in Odoo for BNPL operations.

## Core formulas implemented

- `recurring_invoice_amount = (total_with_tax - deposit) / term_months` (monthly BNPL on price after deposit)
- `total_paid = sum(installment amount_paid)` when installments exist; else `deposit + sum(posted payments)`
- `accrued_amount = sum(unpaid installments with due_date < today)`
- `next_payment_due_amount = accrued_amount + current_due_amount`

## Debtor ↔ Accounting ↔ CRM (stand number)

**Stand number** is the canonical key linking systems: at most **one** `lakecity.loan.contract` per stand (`stand_number`), and BNPL-linked **`crm.lead`** rows are constrained so the same stand is not reused. On **every** contract **`create`** / **`write`**, Odoo promotes the linked **`partner_id`** as a Sales/Accounting customer (`customer_rank` when installed) and **upserts** the matching **`crm.lead`** (by `lakecity_contract_external_uid`). The partner form (**Lakecity BNPL** block) shows linked contracts and a computed stand list.

## Main models

- `lakecity.loan.product`
- `lakecity.loan.contract`
- `lakecity.loan.installment`
- `lakecity.loan.payment`

## Roles (Lakecity Loan User vs Manager)

- **Lakecity Loan User** (`group_lakecity_loan_user`) — operational staff with loan menus and **write access on contracts only**, so header/form buttons (**Activate**, **Generate Schedule**, **Recompute installments**, etc.) work in Odoo 19 (Odoo requires model write permission before executing object buttons).
- **Lakecity Loan Manager** (`group_lakecity_loan_manager`) — full CRUD on loan products, contracts, installments, payments, receipt intake, and backfill wizard.

If buttons appear disabled or clicks raise **Access Error**, assign **Loan Manager** or confirm your login has **Lakecity Loan User** plus **write on contracts** (upgrade module **19.0.1.0.37+** if missing).

### Docutils / “Unexpected indentation” in Odoo.sh logs

Odoo renders Apps descriptions with docutils when HTML is missing. This addon ships `static/description/index.html` **and** extends `ir.module.module._get_desc` for `lakecity_loan_management` so RST is never used for our module (avoids stderr noise if paths differ on the host).

## Customer Portal enrolment and deposit (19.0.1.0.52+)

On each **loan contract** (and mirrored on **Accounting → Customer** via **Portal settings contract**):

| Field | Purpose |
|-------|---------|
| **Portal enrolled** | Gate: must be ON before the stand can sign up or load dashboard data on the Customer Portal |
| **Deposit required** | Whether a deposit applies |
| **Deposit in 3 monthly payments** | When ON, **Generate Schedule** creates three deposit installments (dates 1–3) before the main BNPL term starting at **BNPL payment start** |
| **Deposit due date** / **Deposit payment 1–3** | Due dates for single or split deposit |

Settings sync to Supabase `stand_portal_settings` when system parameters `lakecity.portal_supabase_sync_url` and `lakecity.portal_supabase_sync_token` are set (POST to edge function `sync-stand-portal-settings`).

Upgrade **19.0.1.0.52** grandfathers **active** contracts as enrolled; existing `profiles.stand_number` rows are enrolled via SQL migration.

## Workflow

1. Create Loan Product.
2. Create Loan Contract (set **Total price** net excl. VAT, **Tax rate** e.g. 15.5%, **Stand cost**, **Deposit** gross).
3. Click **Activate** — posts initial contract JE (+ optional inventory reclass + deposit JEs when stand sales accounting is on).
4. Click **Generate Schedule** to create installment lines (if not auto-generated on activate).
5. Post payments in **Payments** — each posted payment creates receipt, revenue/VAT release, and COS journal entries.

## Stand sales accounting (ZIMRA walkthrough) — 19.0.1.0.47+

When **Stand sales accounting** is enabled on the company (Settings → Companies → Lakecity BNPL tab):

| Event | Journal entries |
|-------|-----------------|
| Contract **Activate** | Dr AR / Cr contract liability + deferred VAT; optional inventory reclass; deposit JEs if deposit set |
| Each **posted payment** | Dr bank / Cr AR; Dr liability + deferred VAT / Cr revenue + VAT output; Dr COS / Cr inventory |
| **Remit VAT Output balance** | Company button — Dr 251010 / Cr bank |
| **Post forfeiture** | Clear unpaid balances; reclass revenue to forfeiture income; reverse COS |
| **Cancel with refund** | Reverse revenue/COS; admin fee + refund payable |
| **Pass-through** buttons | AOS (213010) or conveyancing (213020) receipt |

Chart of accounts is synced from `Account (account.account) (2).xlsx` on install/upgrade (missing codes only). Account **251020** is renamed **Deferred Output VAT**. Supplemental accounts: **121015**, **212080**, **212090**.

Legacy BNPL GL mirror (Dr AR / Cr 251001) is **disabled** when stand sales accounting is on.

Regenerate reference COA XML: `python3 scripts/generate_lakecity_coa_xml.py`

## Stand cost master & phase reporting — 19.0.1.0.48+

Authoritative stand inventory and development cost lives in `docs/stand-inventory-costing/Inventory_per_Stand_Costing_26May2026.xlsx` (conclusive list of all stands). The stand sales JE walkthrough is in `docs/stand-inventory-costing/LakeCity_Stand_Sales_JE_Walkthrough.xlsx`.

Odoo loads **`lakecity.stand.cost`** rows from `data/lakecity_stand_cost_master.csv` (regenerate with `python3 scripts/generate_stand_cost_master_csv.py`). Each row links a **stand number** to a **Phase** (`lakecity.stand.phase`), area, cost/sqm, and total development cost.

- **Stand cost master** menu — browse all stands and phases.
- **Loan contracts** — auto-fill **Stand cost** and **Project phase** from the master when `stand_number` is set.
- **Stand sales by phase** (Accounting → Reporting) — pivot on journal items filtered to stand-sale moves; group by phase and account for revenue, COS, and profit analysis.

Phase is stamped on `account.move` and `account.move.line` when stand-sales JEs are posted.

## API controllers (for Supabase integration)

Set Odoo system parameter:

- `lakecity_loan.api_token=<strong secret>`

Endpoints (Bearer token required):

- `GET /lakecity/api/v1/health`
- `POST /lakecity/api/v1/loan/upsert` — optional JSON key **`create_crm_lead_first`**: when **true**, creates (or reuses) a **`crm.lead`** **before** `res.partner` and `lakecity.loan.contract`, then links **`partner_id`**. Response includes **`crm_lead_id`**, **`partner_id`**, and **`stand_number`** when the CRM row exists (**19.0.1.0.6+**). Requires **`crm`** (installed automatically as a dependency **19.0.1.0.4+**).
- `POST /lakecity/api/v1/stand/product-sync` — upsert one **`product.template`** / variant per **`stand_number`** (`lakecity_stand_number`); **sale_ok** and on-hand **qty** follow portal rules (qty **1** when marketable, **0** when sold/reserved). Body may include **`archive: true`** when removing a stand from the portal.
- `POST /lakecity/api/v1/stand/product-sync-batch` — same for an **`items`** array (max **500** rows). Used by Supabase function **`sync-stand-odoo-product`**.
- `GET /lakecity/api/v1/loan/get?external_uid=...`
- `GET /lakecity/api/v1/loan/installments?external_uid=...`
- `POST /lakecity/api/v1/payment/post`
- `POST /lakecity/api/v1/loan/status`
