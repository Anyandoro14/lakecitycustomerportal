# -*- coding: utf-8 -*-
{
    "name": "Lakecity BNPL Loan Management",
    "version": "19.0.1.0.25",
    "summary": "BNPL loan contracts, schedules, accruals, and payment allocation (Odoo 19/Odoo.sh)",
    "description": """
Lakecity BNPL Loan Management
=============================

Implements a dedicated BNPL loan module with:
- Loan products and term templates
- Loan contracts per customer/stand
- Auto-generated installment schedules
- Payment posting with oldest-due-first allocation
- Core financial KPIs used by the customer portal:
  * monthly payment = (total_with_tax - deposit) / term (flat; 0% products use principal-only split)
  * installment due dates align to Loan Product due day monthly (default 5th)
  * total_paid = deposit + posted payments
  * accrued_amount = past-due unpaid amount
  * next_payment_due_amount = accrued + current due
""",
    "author": "Lakecity",
    "license": "LGPL-3",
    "category": "Accounting/Accounting",
    "depends": [
        "base",
        "mail",
        "contacts",
        "crm",
        "lakecity_branding",
        "stock",
        "sale_management",
        "account",
    ],
    "data": [
        "security/lakecity_loan_security.xml",
        "security/ir.model.access.csv",
        "data/loan_sequence.xml",
        "data/account_payment_methods.xml",
        "data/loan_products.xml",
        "data/recompute_installment_actions.xml",
        "views/loan_product_views.xml",
        "views/loan_contract_views.xml",
        "views/loan_payment_views.xml",
        "views/loan_installment_views.xml",
        "views/receipt_intake_views.xml",
        "wizard/bank_payment_backfill_views.xml",
        "views/loan_menus.xml",
        "views/crm_lead_views.xml",
        "views/account_payment_register_views.xml",
        "views/res_company_views.xml",
        "views/res_partner_views.xml",
        "views/product_template_views.xml",
    ],
    "application": True,
    "installable": True,
    "post_init_hook": "post_init_hook",
}
