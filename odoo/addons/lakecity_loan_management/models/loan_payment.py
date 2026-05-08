# -*- coding: utf-8 -*-
from odoo import api, fields, models


class LakecityLoanPayment(models.Model):
    _name = "lakecity.loan.payment"
    _description = "Lakecity Loan Payment"
    _order = "payment_date desc, id desc"

    name = fields.Char(default="New", readonly=True, copy=False)
    external_uid = fields.Char(copy=False, index=True)
    contract_id = fields.Many2one("lakecity.loan.contract", required=True, ondelete="cascade")
    partner_id = fields.Many2one(related="contract_id.partner_id", store=True, readonly=True)
    stand_number = fields.Char(related="contract_id.stand_number", store=True, readonly=True)
    payment_date = fields.Date(required=True, default=fields.Date.context_today)
    amount = fields.Monetary(required=True)
    currency_id = fields.Many2one(related="contract_id.currency_id", store=True, readonly=True)
    source = fields.Selection(
        [
            ("manual", "Manual"),
            ("kuva", "KUVA"),
            ("paystack", "Paystack"),
            ("paypal", "PayPal"),
            ("flutterwave", "Flutterwave"),
            ("odoo", "Odoo"),
        ],
        default="manual",
        required=True,
    )
    reference = fields.Char()
    note = fields.Text()
    state = fields.Selection(
        [("draft", "Draft"), ("posted", "Posted"), ("cancelled", "Cancelled")],
        default="posted",
        required=True,
    )

    _sql_constraints = [
        ("lakecity_loan_payment_external_uid_unique", "unique(external_uid)", "External payment UID must be unique."),
    ]

    @api.model_create_multi
    def create(self, vals_list):
        seq = self.env["ir.sequence"]
        for vals in vals_list:
            if vals.get("name", "New") == "New":
                vals["name"] = seq.next_by_code("lakecity.loan.payment") or "New"
        payments = super().create(vals_list)
        payments._apply_to_schedules()
        return payments

    def write(self, vals):
        result = super().write(vals)
        if "state" in vals or "amount" in vals or "contract_id" in vals or "payment_date" in vals:
            self.mapped("contract_id")._rebuild_payment_allocations()
        return result

    def _apply_to_schedules(self):
        self.mapped("contract_id")._rebuild_payment_allocations()
