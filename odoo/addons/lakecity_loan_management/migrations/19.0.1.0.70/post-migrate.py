# -*- coding: utf-8 -*-
"""19.0.1.0.70 — partner email sync API + placeholder overwrite on upsert."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.70: partner email overwrite replaces blank / "
        "@lakecity.portal placeholders on loan upsert; "
        "POST /lakecity/api/v1/partner/email/sync for Collection Schedule "
        "stand→email backfill (scripts/sync-partner-emails-from-csv.mjs)."
    )
