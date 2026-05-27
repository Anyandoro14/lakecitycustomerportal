# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    lakecity_stand_number = fields.Char(
        string="Lake City stand #",
        index=True,
        copy=False,
        help="Physical stand key from Lake City inventory; one product per stand.",
    )
    lakecity_stand_cost_id = fields.Many2one(
        "lakecity.stand.cost",
        string="Stand cost master",
        copy=False,
        help="Authoritative development cost from the inventory costing register.",
    )
    lakecity_stand_phase_id = fields.Many2one(
        "lakecity.stand.phase",
        string="Project phase",
        related="lakecity_stand_cost_id.phase_id",
        store=True,
        readonly=True,
        index=True,
    )
    lakecity_stand_area_sqm = fields.Float(
        string="Area (sqm)",
        related="lakecity_stand_cost_id.area_sqm",
        readonly=True,
    )
    lakecity_stand_cost_per_sqm = fields.Monetary(
        string="Cost/sqm",
        related="lakecity_stand_cost_id.cost_per_sqm",
        currency_field="currency_id",
        readonly=True,
    )
    lakecity_stand_total_cost = fields.Monetary(
        string="Total development cost",
        related="lakecity_stand_cost_id.total_cost",
        currency_field="currency_id",
        readonly=True,
    )

    def _lakecity_apply_stand_cost(self, cost_record=None):
        Cost = self.env["lakecity.stand.cost"]
        for rec in self:
            cost = cost_record
            if not cost and rec.lakecity_stand_number:
                cost = Cost._lakecity_lookup_by_stand(rec.lakecity_stand_number)
            if cost and rec.lakecity_stand_cost_id != cost:
                rec.lakecity_stand_cost_id = cost.id

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec, vals in zip(records, vals_list):
            if vals.get("lakecity_stand_number") and not vals.get("lakecity_stand_cost_id"):
                rec._lakecity_apply_stand_cost()
        return records

    def write(self, vals):
        res = super().write(vals)
        if vals.get("lakecity_stand_number"):
            self.filtered(lambda t: t.lakecity_stand_number)._lakecity_apply_stand_cost()
        return res
