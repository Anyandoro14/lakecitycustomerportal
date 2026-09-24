# -*- coding: utf-8 -*-
"""19.0.1.0.63 — all historical data migrates no-op'd for Odoo.sh OOM."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info("Lakecity 19.0.1.0.63: empty upgrade marker (schema/XML only)")
