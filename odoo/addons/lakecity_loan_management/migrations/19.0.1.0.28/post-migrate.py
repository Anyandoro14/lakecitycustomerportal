# -*- coding: utf-8 -*-
"""19.0.1.0.28 — no-op (ORM schedule repair OOMs Odoo.sh upgrade workers)."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.28: skipped zero-schedule repair during upgrade (Odoo.sh OOM)"
    )
