# -*- coding: utf-8 -*-
"""19.0.1.0.46 — no-op (CRM/GL sync OOMs Odoo.sh upgrade workers)."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.46: skipped partner/GL sync during upgrade (Odoo.sh OOM)"
    )
