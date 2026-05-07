# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    schedule_ids = fields.One2many(
        "lakecity.collection.schedule",
        "partner_id",
        string="Collection Schedules",
    )
    schedule_count = fields.Integer(
        string="# Schedules", compute="_compute_schedule_count"
    )

    @api.depends("schedule_ids")
    def _compute_schedule_count(self):
        for rec in self:
            rec.schedule_count = len(rec.schedule_ids)

    def action_view_schedules(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Collection Schedules",
            "res_model": "lakecity.collection.schedule",
            "view_mode": "list,kanban,form",
            "domain": [("partner_id", "=", self.id)],
            "context": {"default_partner_id": self.id},
        }
