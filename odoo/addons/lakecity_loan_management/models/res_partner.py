# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    lakecity_loan_contract_ids = fields.One2many(
        "lakecity.loan.contract",
        "partner_id",
        string="Lakecity BNPL contracts",
    )
    lakecity_stand_list = fields.Char(
        string="Lakecity stands",
        compute="_compute_lakecity_stand_list",
        store=True,
        help="Comma-separated stands from BNPL contracts (Accounting / CRM join via loan contract rows).",
    )

    @api.depends("lakecity_loan_contract_ids.stand_number")
    def _compute_lakecity_stand_list(self):
        for partner in self:
            stands = sorted(
                {
                    str(s or "").strip().upper()
                    for s in partner.lakecity_loan_contract_ids.mapped("stand_number")
                    if s
                }
            )
            partner.lakecity_stand_list = ", ".join(stands)
