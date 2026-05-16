# -*- coding: utf-8 -*-
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class LakecityLoanProduct(models.Model):
    _name = "lakecity.loan.product"
    _description = "Lakecity Loan Product"
    _order = "name"

    name = fields.Char(required=True)
    code = fields.Char(required=True)
    term_months = fields.Integer(required=True, default=36)
    annual_rate = fields.Float(string="Annual Rate (%)", default=0.0)
    grace_days = fields.Integer(default=0)
    due_day = fields.Integer(
        default=5,
        help="Contracts using this plan default installments to this calendar day "
        "(e.g. 5 = payable on the 5th each month after schedule generation).",
    )
    active = fields.Boolean(default=True)

    _loan_product_code_unique = models.Constraint(
        "unique(code)",
        "Loan product code must be unique.",
    )

    @api.constrains("due_day")
    def _check_due_day(self):
        for rec in self:
            if rec.due_day < 1 or rec.due_day > 31:
                raise ValidationError(_("Installment due day must be between 1 and 31."))
