# -*- coding: utf-8 -*-
"""19.0.1.0.69 — opening equity for pre-cutoff receipts + source→journal mapping."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.69: opening-balance receipts debit Retained Earnings "
        "(303000) instead of CABS; optional cash/EcoCash/Kuva journals; "
        "GET /lakecity/api/v1/loan/reconcile-export for daily three-way reconcile. "
        "Re-run Accounting start cutover with force=true after upgrade to repost "
        "opening lumps onto equity if they previously hit bank."
    )
