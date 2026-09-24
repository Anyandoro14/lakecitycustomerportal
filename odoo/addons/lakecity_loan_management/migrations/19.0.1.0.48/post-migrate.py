# -*- coding: utf-8 -*-
"""19.0.1.0.48 — no-op (CSV import + move rewrite OOMs Odoo.sh workers)."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.48: skipped stand-cost CSV/move backfill during upgrade (Odoo.sh OOM)"
    )
