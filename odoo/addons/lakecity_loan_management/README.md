# Lakecity BNPL Loan Management (Odoo)

This module provides a dedicated loan engine in Odoo for BNPL operations.

## Core formulas implemented

- `recurring_invoice_amount = (total_with_tax - deposit) / term_months`
- `total_paid = deposit + sum(posted payments)`
- `accrued_amount = sum(unpaid installments with due_date < today)`
- `next_payment_due_amount = accrued_amount + current_due_amount`

## Debtor ↔ Accounting ↔ CRM (stand number)

**Stand number** is the canonical key linking systems: at most **one** `lakecity.loan.contract` per stand (`stand_number`), and BNPL-linked **`crm.lead`** rows are constrained so the same stand is not reused. On **every** contract **`create`** / **`write`**, Odoo promotes the linked **`partner_id`** as a Sales/Accounting customer (`customer_rank` when installed) and **upserts** the matching **`crm.lead`** (by `lakecity_contract_external_uid`). The partner form (**Lakecity BNPL** block) shows linked contracts and a computed stand list.

## Main models

- `lakecity.loan.product`
- `lakecity.loan.contract`
- `lakecity.loan.installment`
- `lakecity.loan.payment`

## Workflow

1. Create Loan Product.
2. Create Loan Contract.
3. Click **Generate Schedule** to create installment lines.
4. Post payments in **Payments** (auto-allocates to oldest due installments).

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
