# -*- coding: utf-8 -*-
{
    "name": "Daily Reconciliation",
    "version": "19.0.1.0.0",
    "summary": "Daily exception queue for BNPL three-way reconcile mismatches.",
    "description": (
        "Standalone Daily Reconciliation app: review and resolve exceptions from the "
        "Collection Schedule ↔ Sales Master ↔ Odoo three-way reconcile. Import CSV/JSON "
        "from scripts/daily-bnpl-three-way-reconcile.mjs (issue codes align with the "
        "operator runbook). Not nested under Accounting."
    ),
    "author": "Lakecity",
    "license": "LGPL-3",
    "category": "Productivity",
    "depends": [
        "base",
        "mail",
        "web",
        "lakecity_docutils_patch",
        "lakecity_loan_management",
    ],
    "data": [
        "security/daily_reconciliation_security.xml",
        "security/ir.model.access.csv",
        "data/sequence.xml",
        "views/daily_reconciliation_views.xml",
        "wizard/import_reconcile_wizard_views.xml",
        "views/menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "daily_reconciliation/static/src/scss/daily_reconciliation.scss",
        ],
    },
    "application": True,
    "installable": True,
}
