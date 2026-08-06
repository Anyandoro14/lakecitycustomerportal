# -*- coding: utf-8 -*-
"""19.0.1.0.66 — force opening-balance clear keeps post-cutover receipts."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.66: opening force clears only pre-cutover + opening-balance-* payments"
    )
