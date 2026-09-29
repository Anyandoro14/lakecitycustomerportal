# -*- coding: utf-8 -*-
"""19.0.1.0.74 — ensure CABS Waltich liquidity COA 101412 (chart XML is noupdate=1).

Fresh installs get ``lakecity_coa_101412`` from data XML. Existing Staging/Main
DBs may already have loaded the noupdate chart, so this upgrade creates the
account by code when missing. Mapping is by account code; create a bank journal
named Waltich (or Cabs Waltich) pointing at 101412 in Accounting if Staging does
not already have one (journals were seeded in DB, not from this addon XML).
"""
import logging

_logger = logging.getLogger(__name__)

WALTICH_CODE = "101412"
WALTICH_NAME = "CABS - Waltich - 975"


def migrate(cr, version):
    from odoo import SUPERUSER_ID, api

    env = api.Environment(cr, SUPERUSER_ID, {})
    Account = env["account.account"].sudo()
    Currency = env["res.currency"].sudo()
    usd = Currency.search([("name", "=", "USD")], limit=1)
    created = 0
    for company in env["res.company"].sudo().search([]):
        existing = Account.with_company(company).search(
            [("code", "=", WALTICH_CODE), *Account._check_company_domain(company)],
            limit=1,
        )
        if existing:
            continue
        vals = {
            "code": WALTICH_CODE,
            "name": WALTICH_NAME,
            "account_type": "asset_cash",
            "company_ids": [(6, 0, company.ids)],
        }
        if usd:
            vals["currency_id"] = usd.id
        Account.create(vals)
        created += 1
    _logger.info(
        "Lakecity 19.0.1.0.74: ensured COA %s (%s); created=%s. "
        "Upgrade module; confirm bank journal Waltich → 101412 if missing on Staging.",
        WALTICH_CODE,
        WALTICH_NAME,
        created,
    )
