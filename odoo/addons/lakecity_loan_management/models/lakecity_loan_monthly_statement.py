# -*- coding: utf-8 -*-
import calendar

from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models


class LakecityLoanMonthlyStatementPayment(models.Model):
    _name = "lakecity.loan.monthly.statement.payment"
    _description = "Lakecity loan statement payment line"
    _order = "payment_date, id"

    statement_id = fields.Many2one(
        "lakecity.loan.monthly.statement",
        required=True,
        ondelete="cascade",
    )
    payment_date = fields.Date(required=True)
    amount = fields.Monetary(required=True)
    currency_id = fields.Many2one(related="statement_id.currency_id", store=True, readonly=True)
    reference = fields.Char()
    source = fields.Char(string="Payment method")
    payment_id = fields.Many2one("lakecity.loan.payment", ondelete="set null")


class LakecityLoanMonthlyStatement(models.Model):
    _name = "lakecity.loan.monthly.statement"
    _description = "Lakecity loan customer monthly statement"
    _order = "statement_month desc, id desc"

    name = fields.Char(compute="_compute_name", store=True)
    contract_id = fields.Many2one(
        "lakecity.loan.contract",
        required=True,
        ondelete="cascade",
        index=True,
    )
    partner_id = fields.Many2one(related="contract_id.partner_id", store=True, readonly=True)
    stand_number = fields.Char(related="contract_id.stand_number", store=True, readonly=True)
    company_id = fields.Many2one(related="contract_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(related="contract_id.currency_id", store=True, readonly=True)
    customer_email = fields.Char(related="partner_id.email", store=True, readonly=True)
    statement_month = fields.Date(required=True, index=True, help="First calendar day of the statement month.")
    opening_balance = fields.Monetary(required=True)
    closing_balance = fields.Monetary(required=True)
    total_payments = fields.Monetary(required=True)
    is_overdue = fields.Boolean(default=False)
    days_overdue = fields.Integer(default=0)
    generated_at = fields.Datetime(default=fields.Datetime.now, readonly=True)
    payment_line_ids = fields.One2many(
        "lakecity.loan.monthly.statement.payment",
        "statement_id",
        string="Payments received",
    )

    _lakecity_statement_month_unique = models.Constraint(
        "unique(contract_id, statement_month)",
        "Only one statement per contract and month.",
    )

    @api.depends("stand_number", "statement_month")
    def _compute_name(self):
        for rec in self:
            if rec.statement_month and rec.stand_number:
                rec.name = _("Stand %(stand)s — %(month)s") % {
                    "stand": rec.stand_number,
                    "month": rec.statement_month.strftime("%B %Y"),
                }
            else:
                rec.name = _("Customer statement")

    def action_print_statement(self):
        self.ensure_one()
        self.contract_id._lakecity_ensure_monthly_statements_fresh()
        return self.env.ref(
            "lakecity_loan_management.action_report_lakecity_loan_statement"
        ).report_action(self)
