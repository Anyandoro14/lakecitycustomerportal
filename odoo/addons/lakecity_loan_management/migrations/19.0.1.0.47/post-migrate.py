# -*- coding: utf-8 -*-
"""19.0.1.0.47 — no-op (JE backfill for all contracts OOMs Odoo.sh workers)."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.47: skipped stand-sales JE backfill during upgrade (Odoo.sh OOM)"
    )
