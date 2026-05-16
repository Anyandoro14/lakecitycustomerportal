# -*- coding: utf-8 -*-
from odoo import api, fields, models


class AccountMove(models.Model):
    _inherit = "account.move"

    lakecity_loan_contract_id = fields.Many2one(
        "lakecity.loan.contract",
        string="Lakecity loan contract",
        readonly=True,
        copy=False,
        index=True,
        ondelete="set null",
    )

    @api.model_create_multi
    def create(self, vals_list):
        moves = super().create(vals_list)
        moves._lakecity_provision_partner_trade_accounts_from_moves()
        return moves

    def write(self, vals):
        res = super().write(vals)
        self._lakecity_provision_partner_trade_accounts_from_moves()
        return res

    def _lakecity_provision_partner_trade_accounts_from_moves(self):
        """Dedicated AR/AP GL rows only once billing documents exist (not from CRM alone)."""
        if "account.account" not in self.env:
            return
        for move in self:
            if not move.partner_id or not move.company_id:
                continue
            partner = move.partner_id.commercial_partner_id
            company = move.company_id
            if move.move_type in ("out_invoice", "out_refund"):
                psudo = partner.sudo()
                if psudo.customer_rank <= 0:
                    psudo.write({"customer_rank": 1})
                partner._lakecity_ensure_dedicated_receivable_for_company(company)
            elif move.move_type in ("in_invoice", "in_refund"):
                psudo = partner.sudo()
                if psudo.supplier_rank <= 0:
                    psudo.write({"supplier_rank": 1})
                partner._lakecity_ensure_dedicated_payable_for_company(company)
