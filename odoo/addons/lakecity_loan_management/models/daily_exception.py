# -*- coding: utf-8 -*-
"""Daily exception rows: Odoo vs portal/collection/master — extends discrepancy logging."""
from odoo import api, fields, models


class LakecityDailyException(models.Model):
    _name = "lakecity.daily.exception"
    _description = "Daily BNPL exception (Odoo vs portal/collection/master)"
    _order = "exception_date desc, id desc"
    _inherit = ["mail.thread"]

    name = fields.Char(compute="_compute_name", store=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    exception_date = fields.Date(
        required=True,
        default=fields.Date.context_today,
        index=True,
    )
    source_system = fields.Selection(
        [
            ("odoo", "Odoo only"),
            ("portal", "Portal only"),
            ("collection", "Collection schedule"),
            ("master_sales", "Master sales"),
            ("bank", "Bank statement"),
            ("cross", "Cross-system"),
        ],
        required=True,
        default="cross",
    )
    exception_type = fields.Selection(
        [
            ("missing_in_odoo", "Missing in Odoo"),
            ("missing_in_portal", "Missing in portal"),
            ("amount_mismatch", "Amount mismatch"),
            ("date_mismatch", "Date mismatch"),
            ("stand_mismatch", "Stand mismatch"),
            ("partner_mismatch", "Partner mismatch"),
            ("duplicate", "Duplicate"),
            ("other", "Other"),
        ],
        required=True,
        default="other",
        index=True,
    )
    stand_number = fields.Char(index=True)
    partner_id = fields.Many2one("res.partner")
    amount_odoo = fields.Monetary(currency_field="currency_id")
    amount_other = fields.Monetary(currency_field="currency_id")
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
    )
    payment_date_odoo = fields.Date()
    payment_date_other = fields.Date()
    loan_payment_id = fields.Many2one("lakecity.loan.payment")
    bank_discrepancy_id = fields.Many2one(
        "lakecity.bank.reconcile.discrepancy",
        string="Linked bank discrepancy",
    )
    detail = fields.Text()
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

    @api.depends("stand_number", "exception_type", "exception_date")
    def _compute_name(self):
        for rec in self:
            rec.name = "%s · Stand %s · %s" % (
                rec.exception_date or "?",
                rec.stand_number or "?",
                rec.exception_type or "?",
            )

    def action_mark_resolved(self):
        self.write({"state": "resolved"})
        return True

    def action_mark_ignored(self):
        self.write({"state": "ignored"})
        return True

    @api.model
    def _lakecity_upsert_from_bank_discrepancy(self, discrepancy):
        """Bridge bank three-way failures into the daily exception menu."""
        discrepancy.ensure_one()
        existing = self.search(
            [
                ("bank_discrepancy_id", "=", discrepancy.id),
                ("state", "=", "open"),
            ],
            limit=1,
        )
        vals = {
            "company_id": discrepancy.company_id.id,
            "exception_date": fields.Date.context_today(self),
            "source_system": "bank",
            "exception_type": (
                "amount_mismatch"
                if discrepancy.reason == "amount_mismatch"
                else "stand_mismatch"
                if discrepancy.reason in ("stand_mismatch", "missing_stand")
                else "other"
            ),
            "stand_number": discrepancy.stand_portal or discrepancy.stand_bank or False,
            "amount_odoo": discrepancy.amount_payment,
            "amount_other": discrepancy.amount_bank,
            "currency_id": discrepancy.currency_id.id,
            "loan_payment_id": discrepancy.loan_payment_id.id if discrepancy.loan_payment_id else False,
            "bank_discrepancy_id": discrepancy.id,
            "detail": discrepancy.bank_label or discrepancy.reason,
            "state": "open",
        }
        if existing:
            existing.write(vals)
            return existing
        return self.create(vals)
