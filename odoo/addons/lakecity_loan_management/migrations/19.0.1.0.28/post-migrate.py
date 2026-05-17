# -*- coding: utf-8 -*-
"""Runs on module upgrade to 19.0.1.0.28 — ``post_init_hook`` does NOT run on upgrade."""
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Contract = env["lakecity.loan.contract"].sudo()
    fixed = 0
    for contract in Contract.search([]):
        if contract._lakecity_try_repair_zero_schedule():
            fixed += 1
    if fixed:
        _logger.info(
            "lakecity_loan_management 19.0.1.0.28 post-migrate: repaired %s zero-amount schedules",
            fixed,
        )
