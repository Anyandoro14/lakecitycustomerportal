# -*- coding: utf-8 -*-
"""19.0.1.0.68 — force-delete leftover pre-start stand-sales journal entries."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.68: force-delete leftover pre-start stand-sales JEs "
        "(unreconcile, suspend lock dates, clear inalterable hashes). "
        "Run Accounting start cutover → Force-delete leftover, or POST "
        "cutover-from-payments with sweep_only=true and force=true."
    )
