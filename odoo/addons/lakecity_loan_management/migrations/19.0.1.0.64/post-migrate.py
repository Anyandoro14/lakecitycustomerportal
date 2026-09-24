# -*- coding: utf-8 -*-
"""19.0.1.0.64 — defer statement UI/PDF from upgrade load (Odoo.sh OOM)."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.64: statement views/report not loaded this release; "
        "opening-balance force-clear code is live after Apps upgrade"
    )
