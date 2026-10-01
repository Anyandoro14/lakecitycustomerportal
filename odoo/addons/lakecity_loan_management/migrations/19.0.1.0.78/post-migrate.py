# -*- coding: utf-8 -*-
"""19.0.1.0.78 — VAT split at portal post time + prior overstated-revenue correction wizard.

Does NOT auto-post adjusting entries (Odoo.sh OOM / Staging-first). After upgrade on
Staging, run Lakecity Loans → Correct overstated revenue (VAT): Preview, then Apply
with dry-run off.
"""
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    _logger.info(
        "Lakecity 19.0.1.0.78: portal receipt VAT split hardened "
        "(15.5/115.5 inclusive via _lakecity_split_gross_payment). "
        "Prior overstated revenue: use Correct overstated revenue (VAT) wizard on Staging "
        "(dry-run first). Do not add Trade Receivables to company OPB — portal brings them."
    )
