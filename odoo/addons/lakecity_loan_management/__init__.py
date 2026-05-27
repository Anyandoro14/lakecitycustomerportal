# -*- coding: utf-8 -*-
import logging

from . import models
from . import wizard
from . import controllers

_logger = logging.getLogger(__name__)


def post_init_hook(cr, registry):
    """Install-only hooks; module upgrades run migrations/post-migrate.py instead."""
    try:
        from odoo import SUPERUSER_ID, api

        env = api.Environment(cr, SUPERUSER_ID, {})
        from odoo.addons.lakecity_loan_management.models import lakecity_coa_sync

        lakecity_coa_sync.sync_lakecity_chart_of_accounts(env)
        lakecity_coa_sync.ensure_stand_sales_journal(env)
        env["res.company"].sudo().search([])._lakecity_ensure_stand_sales_setup()
        for company in env["res.company"].sudo().search([]):
            env["lakecity.stand.cost"].with_company(company)._lakecity_import_from_csv(company=company)
        Contract = env["lakecity.loan.contract"].sudo()
        Contract.search([("state", "in", ("active", "defaulted"))])._lakecity_sync_future_receivable_gl()
        fixed = 0
        for c in Contract.search([]):
            if c._lakecity_try_repair_zero_schedule():
                fixed += 1
        if fixed:
            _logger.info("Lakecity BNPL post_init: repaired %s zero-amount schedules", fixed)
    except Exception:
        _logger.exception("Lakecity BNPL: post_init_hook aborted (non-fatal)")
