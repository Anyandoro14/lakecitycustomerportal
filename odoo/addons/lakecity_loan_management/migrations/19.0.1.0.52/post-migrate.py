# -*- coding: utf-8 -*-
"""19.0.1.0.52 — light SQL grandfather for portal enrolment (no ORM)."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    cr.execute(
        """
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'lakecity_loan_contract'
           AND column_name = 'lakecity_portal_enrolled'
        """
    )
    if not cr.fetchone():
        _logger.info("Lakecity 19.0.1.0.52: skip (column missing)")
        return

    cr.execute(
        """
        UPDATE lakecity_loan_contract
           SET lakecity_portal_enrolled = TRUE,
               lakecity_portal_enrolled_at = (NOW() AT TIME ZONE 'UTC')
         WHERE state = 'active'
           AND COALESCE(lakecity_portal_enrolled, FALSE) IS DISTINCT FROM TRUE
        """
    )
    _logger.info(
        "Lakecity 19.0.1.0.52: portal enrolled grandfathered for %s row(s)",
        cr.rowcount,
    )
