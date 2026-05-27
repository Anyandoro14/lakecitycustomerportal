# -*- coding: utf-8 -*-
"""Runs on upgrade to 19.0.1.0.46 — provision dedicated AR for all contracts and refresh BNPL GL mirrors."""
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Contract = env["lakecity.loan.contract"].sudo()
    contracts = Contract.search([])
    if not contracts:
        return
    contracts._lakecity_sync_partner_customer_and_crm()
    contracts._lakecity_sync_future_receivable_gl()
    _logger.info(
        "lakecity_loan_management 19.0.1.0.46 post-migrate: refreshed partner receivable + BNPL GL for %s contracts",
        len(contracts),
    )
