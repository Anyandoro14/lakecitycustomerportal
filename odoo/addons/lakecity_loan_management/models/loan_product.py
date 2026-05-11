# -*- coding: utf-8 -*-
from odoo import fields, models


class LakecityLoanProduct(models.Model):
    _name = "lakecity.loan.product"
    _description = "Lakecity Loan Product"
    _order = "name"

    name = fields.Char(required=True)
    code = fields.Char(required=True)
    term_months = fields.Integer(required=True, default=36)
    annual_rate = fields.Float(string="Annual Rate (%)", default=0.0)
    grace_days = fields.Integer(default=0)
    active = fields.Boolean(default=True)

    _sql_constraints = [
        ("loan_product_code_unique", "unique(code)", "Loan product code must be unique."),
    ]
