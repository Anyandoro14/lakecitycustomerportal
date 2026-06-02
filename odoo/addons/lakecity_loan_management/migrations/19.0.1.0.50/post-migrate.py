# -*- coding: utf-8 -*-
"""19.0.1.0.50 — Customers use main trade receivable (121000), not per-partner GL accounts."""
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Partner = env["res.partner"].sudo()
    Account = env["account.account"].sudo()
    Contract = env["lakecity.loan.contract"].sudo()

    partners_reset = 0
    accounts_archived = 0

    for company in env["res.company"].sudo().search([]):
        main_ar = company._lakecity_account_by_code("121000")
        if not main_ar:
            main_ar = Account.with_company(company).search(
                [
                    ("account_type", "=", "asset_receivable"),
                    ("active", "=", True),
                    *Account._check_company_domain(company),
                ],
                limit=1,
                order="code, id",
            )
        if not main_ar:
            _logger.warning(
                "Lakecity 19.0.1.0.50: no main receivable for %s; skip partner reset",
                company.display_name,
            )
            continue

        customers = Partner.search([("customer_rank", ">", 0)])
        for partner in customers:
            p = partner.with_company(company)
            cur = p.property_account_receivable_id
            if cur and cur.id != main_ar.id:
                p.write({"property_account_receivable_id": main_ar.id})
                partners_reset += 1

        orphans = Account.with_company(company).search(
            [
                ("account_type", "=", "asset_receivable"),
                ("id", "!=", main_ar.id),
                ("code", "=like", "121%"),
                ("name", "ilike", "Trade Receivable%"),
                ("active", "=", True),
            ]
        )
        for acc in orphans:
            lines = env["account.move.line"].sudo().search_count(
                [("account_id", "=", acc.id), ("parent_state", "=", "posted")]
            )
            if lines:
                _logger.info(
                    "Lakecity 19.0.1.0.50: keep account %s (%s) — has posted lines",
                    acc.code,
                    acc.name,
                )
                continue
            acc.write({"active": False})
            accounts_archived += 1

    for contract in Contract.search([]):
        if contract.partner_id:
            contract.partner_id.commercial_partner_id._lakecity_ensure_main_trade_receivable_for_company(
                contract.company_id
            )

    _logger.info(
        "Lakecity 19.0.1.0.50: reset %s partner receivable properties; archived %s orphan AR accounts",
        partners_reset,
        accounts_archived,
    )
