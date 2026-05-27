# -*- coding: utf-8 -*-
from odoo import fields, models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    lakecity_stand_phase_id = fields.Many2one(
        "lakecity.stand.phase",
        string="Project phase",
        readonly=True,
        copy=False,
        index=True,
        help="Lake City project phase for stand sales P&L reporting (revenue, COS, profit).",
    )
    lakecity_loan_contract_id = fields.Many2one(
        "lakecity.loan.contract",
        string="Lakecity loan contract",
        related="move_id.lakecity_loan_contract_id",
        store=True,
        readonly=True,
        index=True,
    )
    lakecity_stand_move_purpose = fields.Selection(
        related="move_id.lakecity_stand_move_purpose",
        store=True,
        readonly=True,
    )
