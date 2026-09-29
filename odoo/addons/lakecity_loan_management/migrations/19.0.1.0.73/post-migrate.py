# -*- coding: utf-8 -*-
"""19.0.1.0.73 — ensure CBZ liquidity COA 101419 (chart XML is noupdate=1).

Fresh installs get ``lakecity_coa_101419`` from data XML. Existing Staging/Main
DBs may already have loaded the noupdate chart, so this upgrade creates the
account by code when missing. Mapping is by account code; create a bank journal
named CBZ pointing at 101419 in Accounting if Staging does not already have one
(journals were seeded in DB, not from this addon XML).
"""
import logging

_logger = logging.getLogger(__name__)

CBZ_CODE = "101419"
CBZ_NAME = "CBZ - Main USD Current Account - 27794540028"


def migrate(cr, version):
    from odoo import SUPERUSER_ID, api

    env = api.Environment(cr, SUPERUSER_ID, {})
    Account = env["account.account"].sudo()
    Currency = env["res.currency"].sudo()
    usd = Currency.search([("name", "=", "USD")], limit=1)
    created = 0
    for company in env["res.company"].sudo().search([]):
        existing = Account.with_company(company).search(
            [("code", "=", CBZ_CODE), *Account._check_company_domain(company)],
            limit=1,
        )
        if existing:
            continue
        vals = {
            "code": CBZ_CODE,
            "name": CBZ_NAME,
            "account_type": "asset_cash",
            "company_ids": [(6, 0, company.ids)],
        }
        if usd:
            vals["currency_id"] = usd.id
        Account.create(vals)
        created += 1
    _logger.info(
        "Lakecity 19.0.1.0.73: ensured COA %s (%s); created=%s. "
        "Upgrade module; confirm bank journal CBZ → 101419 if missing on Staging.",
        CBZ_CODE,
        CBZ_NAME,
        created,
    )
