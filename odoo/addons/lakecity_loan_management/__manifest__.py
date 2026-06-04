# -*- coding: utf-8 -*-
{
    "name": "Lakecity BNPL Loan Management",
    "version": "19.0.1.0.52",
    "summary": "BNPL loan contracts, schedules, accruals, and payment allocation (Odoo 19/Odoo.sh)",
    # Avoid RST-looking multi-line Python docstrings with indented wraps in this addon; Odoo feeds
    # them through docutils during registry load and logs "(ERROR/3) Unexpected indentation".
    "description": (
        "Lakecity BNPL Loan Management: loan products, per-customer contracts and stands, "
        "auto installment schedules, oldest-due-first payment allocation, receipt intake, "
        "and portal-facing balances and KPIs. Schedule math and KPI definitions are in DOCUMENTATION.md."
    ),
    "author": "Lakecity",
    "license": "LGPL-3",
    "category": "Accounting/Accounting",
    "depends": [
        "base",
        "lakecity_docutils_patch",
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
        "data/lakecity_stand_accounting_journals.xml",
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
        "views/lakecity_stand_cost_views.xml",
    ],
    "application": True,
    "installable": True,
    "post_init_hook": "post_init_hook",
}
