# -*- coding: utf-8 -*-
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class CollectionPayment(models.Model):
    """One monthly payment cell from the spreadsheet (cols M..FX).

    Each line is anchored on the 5th of its month. ``amount_paid`` is what
    actually got captured (may be empty until the cell is filled in). The
    parent ``lakecity.collection.schedule`` aggregates these into Total Paid
    / Current Balance / Payment Progress.
    """

    _name = "lakecity.collection.payment"
    _description = "Collection Schedule Monthly Payment"
    _order = "schedule_id, due_date"
    _rec_name = "due_date"

    schedule_id = fields.Many2one(
        "lakecity.collection.schedule",
        string="Schedule",
        required=True,
        ondelete="cascade",
        index=True,
    )
    stand_number = fields.Char(
        related="schedule_id.stand_number", store=True, index=True, readonly=True
    )
    partner_id = fields.Many2one(
        related="schedule_id.partner_id", store=True, readonly=True
    )
    customer_category = fields.Selection(
        related="schedule_id.customer_category", store=True, readonly=True
    )
    currency_id = fields.Many2one(
        related="schedule_id.currency_id", store=True, readonly=True
    )
    company_id = fields.Many2one(
        related="schedule_id.company_id", store=True, readonly=True
    )
    month_index = fields.Integer(string="Month #", help="1-based index within the schedule.")
    due_date = fields.Date(string="Due Date", required=True, index=True)
    expected_amount = fields.Monetary(
        string="Expected",
        related="schedule_id.payment_amount",
        store=True,
        readonly=True,
    )
    amount_paid = fields.Monetary(string="Amount Paid")
    paid_date = fields.Date(string="Paid On")
    is_paid = fields.Boolean(
        string="Paid", compute="_compute_is_paid", store=True
    )
    note = fields.Char(string="Note")

    _sql_constraints = [
        (
            "schedule_due_date_uniq",
            "unique(schedule_id, due_date)",
            "Each schedule can only have one payment line per due date.",
        ),
    ]

    @api.depends("amount_paid")
    def _compute_is_paid(self):
        for rec in self:
            rec.is_paid = bool(rec.amount_paid)

    @api.constrains("due_date")
    def _check_due_date_is_5th(self):
        for rec in self:
            if rec.due_date and rec.due_date.day != 5:
                raise ValidationError(
                    _("Due date must fall on the 5th — see the legacy CS business rule.")
                )

    @api.constrains("amount_paid")
    def _check_amount_non_negative(self):
        for rec in self:
            if rec.amount_paid < 0:
                raise ValidationError(_("Amount Paid cannot be negative."))

    @api.onchange("amount_paid")
    def _onchange_amount_paid(self):
        if self.amount_paid and not self.paid_date:
            self.paid_date = fields.Date.context_today(self)
