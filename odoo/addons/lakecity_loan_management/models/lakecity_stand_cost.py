# -*- coding: utf-8 -*-
import csv
import logging
from pathlib import Path

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

CSV_REL_PATH = Path("lakecity_loan_management/data/lakecity_stand_cost_master.csv")


class LakecityStandPhase(models.Model):
    _name = "lakecity.stand.phase"
    _description = "Lake City project phase"
    _order = "name"

    name = fields.Char(string="Phase", required=True, index=True)
    description = fields.Char(help="Optional long name for reports and filters.")
    active = fields.Boolean(default=True)
    stand_cost_count = fields.Integer(compute="_compute_stand_cost_count")

    _lakecity_stand_phase_name_unique = models.Constraint(
        "unique(name)",
        "Phase code must be unique.",
    )

    @api.depends("name")
    def _compute_stand_cost_count(self):
        grouped = self.env["lakecity.stand.cost"].read_group(
            [("phase_id", "in", self.ids)],
            ["phase_id"],
            ["phase_id"],
        )
        counts = {g["phase_id"][0]: g["phase_id_count"] for g in grouped if g.get("phase_id")}
        for rec in self:
            rec.stand_cost_count = counts.get(rec.id, 0)

    def name_get(self):
        return [(rec.id, rec.name) for rec in self]


class LakecityStandCost(models.Model):
    _name = "lakecity.stand.cost"
    _description = "Stand inventory & development cost (source of truth)"
    _rec_name = "stand_number"
    _order = "stand_number"

    # No tracking=*: this model is not mail.thread (Odoo warns / ignores it).
    stand_number = fields.Char(required=True, index=True)
    phase_id = fields.Many2one(
        "lakecity.stand.phase",
        string="Phase",
        required=True,
        index=True,
        help="Project phase for cost, revenue, and profit reporting.",
    )
    area_sqm = fields.Float(string="Area (sqm)", digits=(14, 2))
    cost_per_sqm = fields.Monetary(string="Cost/sqm", currency_field="currency_id")
    total_cost = fields.Monetary(
        required=True,
        currency_field="currency_id",
        help="Authoritative development cost for this stand; drives COS in the stand sales walkthrough.",
    )
    currency_id = fields.Many2one(
        "res.currency",
        required=True,
        default=lambda self: self.env.company.currency_id,
    )
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    product_tmpl_id = fields.Many2one(
        "product.template",
        string="Odoo product",
        compute="_compute_product_tmpl_id",
        store=True,
        readonly=True,
    )
    active = fields.Boolean(default=True)

    _lakecity_stand_cost_stand_unique = models.Constraint(
        "unique(stand_number)",
        "Each stand may only appear once in the cost master.",
    )

    @api.model
    def _lakecity_normalize_stand_number(self, raw):
        s = str(raw or "").strip().upper()
        if not s or s == "-":
            return ""
        try:
            f = float(s)
            if f == int(f):
                return str(int(f))
        except ValueError:
            pass
        return s

    @api.constrains("stand_number")
    def _check_stand_number(self):
        for rec in self:
            stand = self._lakecity_normalize_stand_number(rec.stand_number)
            if not stand:
                raise ValidationError(_("Stand number is required on a stand cost row."))
            if stand != rec.stand_number:
                raise ValidationError(_("Stand number must be normalised (e.g. 1 not 1.0)."))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("stand_number"):
                vals["stand_number"] = self._lakecity_normalize_stand_number(vals["stand_number"])
        return super().create(vals_list)

    def write(self, vals):
        if vals.get("stand_number"):
            vals["stand_number"] = self._lakecity_normalize_stand_number(vals["stand_number"])
        return super().write(vals)

    @api.depends("stand_number")
    def _compute_product_tmpl_id(self):
        Product = self.env["product.template"]
        for rec in self:
            if not rec.stand_number:
                rec.product_tmpl_id = False
                continue
            tmpl = Product.search([("lakecity_stand_number", "=", rec.stand_number)], limit=1)
            rec.product_tmpl_id = tmpl.id if tmpl else False

    @api.model
    def _lakecity_csv_path(self):
        return Path(__file__).resolve().parents[1] / "data" / "lakecity_stand_cost_master.csv"

    @api.model
    def _lakecity_get_or_create_phase(self, code):
        name = str(code or "").strip().upper()
        if not name or name == "-":
            return self.env["lakecity.stand.phase"]
        Phase = self.env["lakecity.stand.phase"].sudo()
        phase = Phase.search([("name", "=", name)], limit=1)
        if not phase:
            phase = Phase.create({"name": name})
        return phase

    @api.model
    def _lakecity_import_from_csv(self, csv_path=None, company=None):
        """Load or refresh stand cost master from bundled CSV (generated from inventory workbook)."""
        path = Path(csv_path) if csv_path else self._lakecity_csv_path()
        if not path.is_file():
            _logger.warning("Lakecity stand cost: CSV not found at %s", path)
            return {"created": 0, "updated": 0, "skipped": 0}

        company = company or self.env.company
        currency = company.currency_id
        created = updated = skipped = 0

        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                stand = self._lakecity_normalize_stand_number(row.get("stand_number"))
                phase_code = str(row.get("phase") or "").strip().upper()
                if not stand or not phase_code or phase_code == "-":
                    skipped += 1
                    continue
                try:
                    area = float(row.get("area_sqm") or 0.0)
                    cost_sqm = float(row.get("cost_per_sqm") or 0.0)
                    total = float(row.get("total_cost") or 0.0)
                except (TypeError, ValueError):
                    skipped += 1
                    continue

                phase = self._lakecity_get_or_create_phase(phase_code)
                existing = self.sudo().search([("stand_number", "=", stand)], limit=1)
                vals = {
                    "phase_id": phase.id,
                    "area_sqm": area,
                    "cost_per_sqm": cost_sqm,
                    "total_cost": total,
                    "currency_id": currency.id,
                    "company_id": company.id,
                    "active": True,
                }
                if existing:
                    existing.write(vals)
                    updated += 1
                else:
                    self.sudo().create(dict(vals, stand_number=stand))
                    created += 1

        _logger.info(
            "Lakecity stand cost import: created=%s updated=%s skipped=%s from %s",
            created,
            updated,
            skipped,
            path,
        )
        return {"created": created, "updated": updated, "skipped": skipped}

    @api.model
    def _lakecity_lookup_by_stand(self, stand_number):
        stand = self._lakecity_normalize_stand_number(stand_number)
        if not stand:
            return self.browse()
        return self.search([("stand_number", "=", stand)], limit=1)

    def _lakecity_sync_linked_product(self):
        Product = self.env["product.template"].sudo()
        for rec in self:
            tmpl = Product.search([("lakecity_stand_number", "=", rec.stand_number)], limit=1)
            if tmpl:
                tmpl._lakecity_apply_stand_cost(rec)
