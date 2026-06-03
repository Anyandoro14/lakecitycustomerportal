# -*- coding: utf-8 -*-
"""19.0.1.0.51 — Consolidate AR on 121000 for accurate trial balance."""
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    total_lines = total_archived = total_mirrors = 0

    for company in env["res.company"].sudo().search([]):
        company.write(
            {
                "lakecity_bnpl_future_receivable_gl_enabled": False,
                "lakecity_bnpl_post_bank_payment_per_receipt": False,
            }
        )
        stats = company._lakecity_consolidate_orphan_ar_to_main()
        mirrors = company._lakecity_clear_bnpl_mirror_moves()
        total_lines += stats.get("lines_moved", 0)
        total_archived += stats.get("accounts_archived", 0)
        total_mirrors += mirrors

        Contract = env["lakecity.loan.contract"].sudo()
        for contract in Contract.search([("company_id", "=", company.id)]):
            if contract.partner_id:
                contract.partner_id.commercial_partner_id._lakecity_ensure_main_trade_receivable_for_company(
                    company
                )

    _logger.info(
        "Lakecity 19.0.1.0.51: moved %s AR line(s) to 121000, archived %s orphan account(s), "
        "cleared %s BNPL mirror(s)",
        total_lines,
        total_archived,
        total_mirrors,
    )
