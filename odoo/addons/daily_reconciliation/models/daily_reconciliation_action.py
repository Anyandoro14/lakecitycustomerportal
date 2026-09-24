# -*- coding: utf-8 -*-
from odoo import fields, models


class DailyReconciliationAction(models.Model):
    _name = "daily.reconciliation.action"
    _description = "Daily Reconciliation Action History"
    _order = "create_date desc, id desc"

    exception_id = fields.Many2one(
        "daily.reconciliation.exception",
        string="Exception",
        required=True,
        ondelete="cascade",
        index=True,
    )
    action_type = fields.Selection(
        [
            ("match", "Match"),
            ("adjust_date", "Adjust Date"),
            ("needs_review", "Needs Review"),
            ("close", "Close"),
            ("reopen", "Reopen"),
            ("import", "Import"),
            ("note", "Note"),
        ],
        required=True,
        string="Action",
    )
    note = fields.Text(string="Note")
    user_id = fields.Many2one("res.users", string="User", default=lambda self: self.env.user, required=True)
    create_date = fields.Datetime(string="When", readonly=True)
