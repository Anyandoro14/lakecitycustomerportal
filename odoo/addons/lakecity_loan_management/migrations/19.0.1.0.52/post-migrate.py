# -*- coding: utf-8 -*-
"""19.0.1.0.52 — Portal enrolment gate; grandfather active contracts."""
import logging

from odoo import SUPERUSER_ID, api, fields

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Contract = env["lakecity.loan.contract"].sudo()
    active = Contract.search([("state", "=", "active")])
    if active:
        # Skip CRM / GL / Supabase side-effects — Odoo.sh builds time out or fail
        # if every active contract triggers remote sync during module upgrade.
        active.with_context(
            skip_lakecity_bnpl_gl_sync=True,
            skip_lakecity_partner_crm_sync=True,
            skip_lakecity_portal_supabase_sync=True,
        ).write(
            {
                "lakecity_portal_enrolled": True,
                "lakecity_portal_enrolled_at": fields.Datetime.now(),
            }
        )
    _logger.info(
        "Lakecity 19.0.1.0.52: portal enrolled grandfathered for %s active contract(s)",
        len(active),
    )
