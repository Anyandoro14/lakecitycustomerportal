# -*- coding: utf-8 -*-
"""19.0.1.0.51 — no-op during Odoo.sh builds.

AR consolidation is available from Apps → company → Repair trial balance AR
(SQL path in lakecity_ar_consolidation). Running it inside -u still risked
SIGKILL on small workers when combined with module load.
"""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.51: skipped AR consolidate during upgrade (Odoo.sh OOM); "
        "use action_lakecity_repair_trial_balance_ar after green build if needed"
    )
