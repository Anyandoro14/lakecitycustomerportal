# -*- coding: utf-8 -*-
"""19.0.1.0.62 — Odoo.sh OOM fix: SQL-only migrates 50/51/52."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info("Lakecity 19.0.1.0.62: memory-safe upgrade path (no data changes)")
