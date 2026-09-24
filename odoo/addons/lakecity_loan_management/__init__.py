# -*- coding: utf-8 -*-
import logging

from . import models
from . import wizard
from . import controllers

_logger = logging.getLogger(__name__)


def post_init_hook(cr, registry):
    """Install-only. Keep tiny — heavy COA/CSV/GL work OOMs Odoo.sh workers."""
    try:
        from odoo import SUPERUSER_ID, api

        env = api.Environment(cr, SUPERUSER_ID, {})
        from odoo.addons.lakecity_loan_management.models import lakecity_coa_sync

        lakecity_coa_sync.sync_lakecity_chart_of_accounts(env)
        lakecity_coa_sync.ensure_stand_sales_journal(env)
        env["res.company"].sudo().search([])._lakecity_ensure_stand_sales_setup()
        _logger.info("Lakecity BNPL post_init: COA/journal setup done (heavy backfills skipped)")
    except Exception:
        _logger.exception("Lakecity BNPL: post_init_hook aborted (non-fatal)")
