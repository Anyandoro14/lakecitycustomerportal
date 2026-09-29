# -*- coding: utf-8 -*-
"""19.0.1.0.75 — drop invalid account.reconcile.model fields for Odoo 19 (XML fix).

Staging boot failed on rule_type (removed in 19.x). Data XML no longer sets
rule_type / boolean auto_reconcile / match_partner / to_check; uses trigger.
No DB data rewrite required — noupdate=1 creates new XML IDs on first load.
"""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.75: reconcile-model XML field fix (no data changes)"
    )
