# -*- coding: utf-8 -*-
{
    "name": "Lakecity BNPL Loan Management",
    "version": "19.0.1.0.1",
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
  * recurring_invoice_amount = (total_with_tax - deposit) / term
  * total_paid = deposit + posted payments
  * accrued_amount = past-due unpaid amount
  * next_payment_due_amount = accrued + current due
""",
    "author": "Lakecity",
    "license": "LGPL-3",
    "category": "Accounting/Accounting",
    "depends": ["base", "mail", "contacts"],
    "data": [
        "security/lakecity_loan_security.xml",
        "security/ir.model.access.csv",
        "data/loan_sequence.xml",
        "views/loan_product_views.xml",
        "views/loan_contract_views.xml",
        "views/loan_payment_views.xml",
        "views/loan_installment_views.xml",
        "views/loan_menus.xml",
    ],
    "application": True,
    "installable": True,
}
