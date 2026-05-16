# -*- coding: utf-8 -*-
from . import models
from . import wizard
from . import controllers


def post_init_hook(cr, registry):
    """Backfill GL mirror rows for loans already active after module upgrade."""
    from odoo import SUPERUSER_ID, api

    env = api.Environment(cr, SUPERUSER_ID, {})
    env["lakecity.loan.contract"].sudo().search(
        [("state", "in", ("active", "defaulted"))]
    )._lakecity_sync_future_receivable_gl()
