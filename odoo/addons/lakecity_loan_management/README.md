# Lakecity BNPL Loan Management (Odoo)

This module provides a dedicated loan engine in Odoo for BNPL operations.

## Core formulas implemented

- `recurring_invoice_amount = (total_with_tax - deposit) / term_months`
- `total_paid = deposit + sum(posted payments)`
- `accrued_amount = sum(unpaid installments with due_date < today)`
- `next_payment_due_amount = accrued_amount + current_due_amount`

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
- `POST /lakecity/api/v1/loan/upsert` — optional JSON key **`create_crm_lead_first`**: when **true**, creates (or reuses) a **`crm.lead`** **before** `res.partner` and `lakecity.loan.contract`, then links **`partner_id`**. Response may include **`crm_lead_id`**. Requires **`crm`** (installed automatically as a dependency of this module **19.0.1.0.4+**).
- `GET /lakecity/api/v1/loan/get?external_uid=...`
- `GET /lakecity/api/v1/loan/installments?external_uid=...`
- `POST /lakecity/api/v1/payment/post`
- `POST /lakecity/api/v1/loan/status`
