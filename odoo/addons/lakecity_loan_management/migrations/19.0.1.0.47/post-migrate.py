# -*- coding: utf-8 -*-
"""Upgrade to 19.0.1.0.47 — Lake City COA sync, stand sales accounting, disable BNPL mirror."""
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    from odoo.addons.lakecity_loan_management.models import lakecity_coa_sync

    lakecity_coa_sync.sync_lakecity_chart_of_accounts(env)
    lakecity_coa_sync.ensure_stand_sales_journal(env)
    env["res.company"].sudo().search([])._lakecity_ensure_stand_sales_setup()

    Contract = env["lakecity.loan.contract"].sudo()
    for contract in Contract.search([("state", "=", "active")]):
        contract._lakecity_clear_future_receivable_gl()
        if contract.company_id.lakecity_stand_sales_accounting_enabled and not contract.lakecity_initial_contract_move_id:
            try:
                contract._lakecity_post_initial_contract_recognition()
                contract._lakecity_post_inventory_reclass()
            except Exception as err:
                _logger.warning(
                    "Lakecity: backfill initial JE failed for %s: %s",
                    contract.display_name,
                    err,
                )
        if contract.company_id.lakecity_stand_sales_accounting_enabled and not contract.lakecity_deposit_accounting_done:
            try:
                contract._lakecity_post_deposit_accounting()
            except Exception as err:
                _logger.warning(
                    "Lakecity: backfill deposit JE failed for %s: %s",
                    contract.display_name,
                    err,
                )
        for payment in contract.payment_ids.filtered(lambda p: p.state == "posted"):
            if not payment.lakecity_stand_accounting_done:
                try:
                    contract._lakecity_post_payment_accounting(payment)
                except Exception as err:
                    _logger.warning(
                        "Lakecity: backfill payment JE failed for %s: %s",
                        payment.display_name,
                        err,
                    )

    _logger.info("Lakecity stand sales accounting migration 19.0.1.0.47 complete.")
