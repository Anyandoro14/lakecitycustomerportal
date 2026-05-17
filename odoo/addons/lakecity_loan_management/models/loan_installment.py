# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.tools.float_utils import float_compare, float_is_zero


class LakecityLoanInstallment(models.Model):
    _name = "lakecity.loan.installment"
    _description = "Lakecity Loan Installment"
    _order = "due_date, sequence"

    contract_id = fields.Many2one("lakecity.loan.contract", required=True, ondelete="cascade")
    sequence = fields.Integer(required=True)
    due_date = fields.Date(required=True)
    amount_due = fields.Monetary(required=True)
    amount_paid = fields.Monetary(default=0.0)
    amount_outstanding = fields.Monetary(compute="_compute_amount_outstanding", store=True)
    currency_id = fields.Many2one(related="contract_id.currency_id", store=True, readonly=True)
    state = fields.Selection(
        [
            ("pending", "Pending"),
            ("partial", "Partial"),
            ("paid", "Paid"),
            ("overdue", "Overdue"),
        ],
        compute="_compute_state",
        store=True,
    )

    @api.depends("amount_due", "amount_paid")
    def _compute_amount_outstanding(self):
        for line in self:
            line.amount_outstanding = max(line.amount_due - line.amount_paid, 0.0)

    @api.depends("amount_due", "amount_paid", "due_date")
    def _compute_state(self):
        today = fields.Date.context_today(self)
        for line in self:
            rnd = line.currency_id.rounding if line.currency_id else 0.01
            # amount_due == 0 must not read as "Paid" (0 >= 0 is true); usually bad contract data.
            if float_is_zero(line.amount_due, precision_rounding=rnd):
                line.state = "pending"
            elif float_compare(line.amount_paid, line.amount_due, precision_rounding=rnd) >= 0:
                line.state = "paid"
            elif float_compare(line.amount_paid, 0.0, precision_rounding=rnd) > 0:
                line.state = "partial"
            elif line.due_date and line.due_date < today:
                line.state = "overdue"
            else:
                line.state = "pending"

    def action_lakecity_refresh_stored_computes(self):
        """Redo stored derives (Outstanding, State) from current Due/Paid amounts.

        Prefer ``loan.contract.action_recompute_installment_states`` to also
        re-allocate posted payments oldest-due-first.
        """
        if not self:
            return True
        self._compute_amount_outstanding()
        self._compute_state()
        self.flush_recordset()
        return True
