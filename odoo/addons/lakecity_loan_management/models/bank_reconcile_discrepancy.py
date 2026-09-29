# -*- coding: utf-8 -*-
"""Log when bank-statement auto-reconcile fails the three-way stand check."""
from odoo import api, fields, models


class LakecityBankReconcileDiscrepancy(models.Model):
    _name = "lakecity.bank.reconcile.discrepancy"
    _description = "Bank reconcile stand discrepancy"
    _order = "create_date desc, id desc"
    _inherit = ["mail.thread"]

    name = fields.Char(compute="_compute_name", store=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    statement_line_id = fields.Many2one(
        "account.bank.statement.line",
        string="Statement line",
        ondelete="set null",
        index=True,
    )
    loan_payment_id = fields.Many2one(
        "lakecity.loan.payment",
        string="BNPL payment",
        ondelete="set null",
        index=True,
    )
    account_payment_id = fields.Many2one(
        "account.payment",
        string="Accounting payment",
        ondelete="set null",
    )
    receivable_account_id = fields.Many2one(
        "account.account",
        string="AR account",
        index=True,
    )
    stand_portal = fields.Char(string="Stand (portal / payment)")
    stand_partner = fields.Char(string="Stand (partner / contract)")
    stand_bank = fields.Char(string="Stand (bank label)")
    amount_payment = fields.Monetary(currency_field="currency_id")
    amount_bank = fields.Monetary(currency_field="currency_id")
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
        required=True,
    )
    reason = fields.Selection(
        [
            ("stand_mismatch", "Stand mismatch"),
            ("missing_stand", "Missing stand"),
            ("amount_mismatch", "Amount mismatch"),
            ("amount_unparseable", "Amount unparseable"),
            ("no_candidate", "No payment candidate"),
        ],
        required=True,
        default="stand_mismatch",
        index=True,
    )
    bank_label = fields.Char(string="Bank label / ref")
    state = fields.Selection(
        [
            ("open", "Open"),
            ("resolved", "Resolved"),
            ("ignored", "Ignored"),
        ],
        default="open",
        required=True,
        tracking=True,
        index=True,
    )
    notes = fields.Text()

    @api.depends("stand_portal", "stand_bank", "reason", "statement_line_id")
    def _compute_name(self):
        for rec in self:
            rec.name = "Stand %s ↔ bank %s (%s)" % (
                rec.stand_portal or "?",
                rec.stand_bank or "?",
                rec.reason or "?",
            )

    def action_mark_resolved(self):
        self.write({"state": "resolved"})
        return True

    def action_mark_ignored(self):
        self.write({"state": "ignored"})
        return True
