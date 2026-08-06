# -*- coding: utf-8 -*-
"""19.0.1.0.65 — coerce opening-balance payment_date before Date.to_string."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info("Lakecity 19.0.1.0.65: opening-balance date coerce (no data changes)")
