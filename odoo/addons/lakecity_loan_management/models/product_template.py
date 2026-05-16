# -*- coding: utf-8 -*-
from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    lakecity_stand_number = fields.Char(
        string="Lake City stand #",
        index=True,
        copy=False,
        help="Physical stand key from Lake City inventory; one product per stand.",
    )
