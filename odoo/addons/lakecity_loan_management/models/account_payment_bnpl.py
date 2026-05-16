# -*- coding: utf-8 -*-
from odoo import fields, models


class AccountPayment(models.Model):
    _inherit = "account.payment"

    lakecity_loan_payment_id = fields.Many2one(
        "lakecity.loan.payment",
        string="Lakecity BNPL payment",
        readonly=True,
        copy=False,
        index=True,
        ondelete="set null",
    )
