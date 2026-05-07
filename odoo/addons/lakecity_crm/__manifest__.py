# -*- coding: utf-8 -*-
{
    "name": "Lakecity CRM — Collection Schedule",
    "version": "19.0.1.0.0",
    "summary": (
        "CRM module that mirrors the Lakecity Collection Schedule "
        "(Stand, customer, deposit, monthly payments, agreement workflow)."
    ),
    "description": """
Lakecity CRM — Collection Schedule
==================================

A clean, focused CRM module that contains every field used on the legacy
Excel Collection Schedule, so the existing workflow can be operated entirely
inside Odoo without changes.

Key concepts
------------
* One Stand = one ``lakecity.collection.schedule`` record (CRM-style, with
  chatter and activities).
* Monthly payments are normalized into ``lakecity.collection.payment`` lines
  with a ``due_date`` on the 5th. A pivot view reproduces the spreadsheet
  feel month-by-month.
* All formulas from the legacy template are implemented as stored computed
  fields:

  - ``payment_amount = ROUND((total_price - deposit) / installments, 2)``
  - ``total_paid    = deposit + sum(monthly amounts)``
  - ``current_balance = total_price - total_paid``
  - ``payment_progress = total_paid / total_price``

* Term lengths supported: 12, 24, 36, 48, 60, 72, 84, 96, 120 months.

Operational columns from the spreadsheet (Receipts, Present Y, Offer
Received, Initial Payment Completed, Agreement Requested, Agreement signed
by Warwickshire / by client, Agreement Type (VAT), Agreement of sale file,
Registered) are all preserved as first-class fields.
    """,
    "author": "Lakecity",
    "website": "https://lakecity.example",
    "license": "LGPL-3",
    "category": "Sales/CRM",
    "depends": [
        "base",
        "mail",
        "contacts",
    ],
    "data": [
        "security/lakecity_crm_security.xml",
        "security/ir.model.access.csv",
        "data/customer_category_data.xml",
        "views/collection_schedule_views.xml",
        "views/collection_payment_views.xml",
        "views/res_partner_views.xml",
        "views/menus.xml",
        "wizards/import_schedule_wizard_views.xml",
        "reports/collection_schedule_report.xml",
    ],
    "demo": [
        "demo/demo.xml",
    ],
    "external_dependencies": {
        # Odoo.sh auto-installs from this addon's requirements.txt at build
        # time, so the import wizard works out of the box. We still declare
        # `openpyxl` here so module install fails fast with a clear message
        # if a custom Odoo runtime is missing it.
        "python": ["openpyxl"],
    },
    "images": [
        "static/description/icon.png",
    ],
    "application": True,
    "installable": True,
    "auto_install": False,
}
