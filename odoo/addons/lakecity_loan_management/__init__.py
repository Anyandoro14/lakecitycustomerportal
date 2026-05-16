# -*- coding: utf-8 -*-
import logging

from . import models
from . import wizard
from . import controllers

_logger = logging.getLogger(__name__)


def post_init_hook(cr, registry):
    """Backfill GL mirror rows for loans already active after module upgrade."""
    try:
        from odoo import SUPERUSER_ID, api

        env = api.Environment(cr, SUPERUSER_ID, {})
        env["lakecity.loan.contract"].sudo().search(
            [("state", "in", ("active", "defaulted"))]
        )._lakecity_sync_future_receivable_gl()
    except Exception:
        _logger.exception("Lakecity BNPL: post_init_hook GL sync aborted (non-fatal)")
