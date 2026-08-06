# -*- coding: utf-8 -*-
"""19.0.1.0.50 — Customers use main trade receivable (121000).

Heavy per-partner ORM writes OOM Odoo.sh workers (SIGKILL). Partner receivable
reset is deferred to Apps → company → Repair trial balance AR when needed.
"""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.50: skip partner receivable ORM loop (Odoo.sh memory); "
        "use company action_lakecity_repair_trial_balance_ar if partners still point "
        "at orphan AR accounts"
    )
