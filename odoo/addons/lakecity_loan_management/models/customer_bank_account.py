# -*- coding: utf-8 -*-
"""Customer → bank account list (Alex fills; do not invent mappings)."""
import csv
import io

from odoo import _, api, fields, models


class LakecityCustomerBankAccount(models.Model):
    _name = "lakecity.customer.bank.account"
    _description = "Customer preferred bank / deposit account"
    _order = "partner_id, id"

    name = fields.Char(compute="_compute_name", store=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    partner_id = fields.Many2one("res.partner", string="Customer", required=True, index=True)
    stand_number = fields.Char(index=True)
    bank_label = fields.Char(
        string="Bank / channel label",
        help="Human label matching Form Deposited to: or CABS account nickname.",
    )
    account_id = fields.Many2one(
        "account.account",
        string="Odoo liquidity account",
        help="Optional link to COA once known.",
    )
    account_code = fields.Char(help="COA code if account not linked yet (e.g. 101410).")
    notes = fields.Char()

    @api.depends("partner_id", "stand_number", "bank_label")
    def _compute_name(self):
        for rec in self:
            rec.name = "%s · %s · %s" % (
                rec.partner_id.display_name or "?",
                rec.stand_number or "—",
                rec.bank_label or rec.account_code or "?",
            )

    @api.model
    def _lakecity_csv_template(self):
        """Return CSV template bytes for Alex to fill."""
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "partner_name",
                "partner_email",
                "stand_number",
                "bank_label",
                "account_code",
                "notes",
            ]
        )
        writer.writerow(
            [
                "Example Customer",
                "customer@example.com",
                "26",
                "Cabs",
                "101410",
                "Fill real rows; leave blank rows out",
            ]
        )
        return buf.getvalue().encode("utf-8")

    def action_download_csv_template(self):
        """Window action helper — attach template for download."""
        import base64

        data = base64.b64encode(self._lakecity_csv_template())
        att = self.env["ir.attachment"].sudo().create(
            {
                "name": "lakecity_customer_bank_accounts_template.csv",
                "type": "binary",
                "datas": data,
                "mimetype": "text/csv",
            }
        )
        return {
            "type": "ir.actions.act_url",
            "url": "/web/content/%s?download=true" % att.id,
            "target": "new",
        }
