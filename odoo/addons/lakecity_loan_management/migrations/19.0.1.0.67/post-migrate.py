# -*- coding: utf-8 -*-
"""19.0.1.0.67 — accounting start date 2026-01-01; cutover from posted payments."""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    cr.execute(
        """
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'res_company'
           AND column_name = 'lakecity_accounting_start_date'
        """
    )
    if cr.fetchone():
        cr.execute(
            """
            UPDATE res_company
               SET lakecity_accounting_start_date = '2026-01-01'
             WHERE lakecity_accounting_start_date IS NULL
            """
        )
    _logger.info(
        "Lakecity 19.0.1.0.67: accounting start 2026-01-01; cutover-from-payments + skip pre-start JEs"
    )
