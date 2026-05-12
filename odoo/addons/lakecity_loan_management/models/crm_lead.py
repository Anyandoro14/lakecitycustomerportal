# -*- coding: utf-8 -*-
from odoo import fields, models


class CrmLead(models.Model):
    _inherit = "crm.lead"

    lakecity_contract_external_uid = fields.Char(
        string="Lakecity contract external UID",
        index=True,
        copy=False,
        help="BNPL import key (matches lakecity.loan.contract.external_uid). At most one lead per UID.",
    )
    lakecity_stand_number = fields.Char(string="Lakecity stand", copy=False)

    _sql_constraints = [
        (
            "lakecity_crm_lead_contract_uid_uniq",
            "unique(lakecity_contract_external_uid)",
            "Another CRM lead already uses this Lakecity contract external UID.",
        ),
    ]
