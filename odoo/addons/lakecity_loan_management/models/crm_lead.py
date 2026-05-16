# -*- coding: utf-8 -*-
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class CrmLead(models.Model):
    _inherit = "crm.lead"

    lakecity_contract_external_uid = fields.Char(
        string="Lakecity contract external UID",
        index=True,
        copy=False,
        help="BNPL import key (matches lakecity.loan.contract.external_uid). At most one lead per UID.",
    )
    lakecity_stand_number = fields.Char(string="Lakecity stand", copy=False, index=True)

    _sql_constraints = [
        (
            "lakecity_crm_lead_contract_uid_uniq",
            "unique(lakecity_contract_external_uid)",
            "Another CRM lead already uses this Lakecity contract external UID.",
        ),
    ]

    @api.constrains("lakecity_stand_number", "lakecity_contract_external_uid")
    def _lakecity_check_stand_unique_per_bnpl(self):
        """One BNPL-tagged CRM row per physical stand number (exact match chain: loan ⇄ CRM)."""
        for lead in self:
            stand = (lead.lakecity_stand_number or "").strip().upper()
            if not stand or not lead.lakecity_contract_external_uid:
                continue
            dup = self.search_count(
                [
                    ("lakecity_stand_number", "=", stand),
                    ("lakecity_contract_external_uid", "!=", False),
                    ("id", "!=", lead.id),
                ]
            )
            if dup:
                raise ValidationError(
                    _("Lakecity BNPL CRM: stand %s is already tied to another opportunity.") % stand
                )
