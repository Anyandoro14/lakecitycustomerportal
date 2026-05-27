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
    lakecity_stand_phase_id = fields.Many2one(
        "lakecity.stand.phase",
        string="Project phase",
        readonly=True,
        copy=False,
        index=True,
        help="Lake City project phase for stand sales reporting (cost, revenue, profit by phase).",
    )
    lakecity_stand_move_purpose = fields.Selection(
        [
            ("initial_contract", "Initial contract recognition"),
            ("inventory_reclass", "Inventory reclass"),
            ("payment_receipt", "Payment receipt"),
            ("payment_revenue_vat", "Revenue / VAT release"),
            ("payment_cos", "Cost of sales"),
            ("forfeiture_clear", "Forfeiture — clear balance"),
            ("forfeiture_revenue", "Forfeiture — revenue reclass"),
            ("forfeiture_cos", "Forfeiture — COS reversal"),
            ("cancellation_revenue", "Cancellation — revenue reversal"),
            ("cancellation_cos", "Cancellation — COS reversal"),
            ("cancellation_refund", "Cancellation — refund"),
            ("default_reclass", "Default — receivable reclass"),
            ("vat_remittance", "VAT remittance"),
            ("pass_through_aos", "AOS pass-through receipt"),
            ("pass_through_conveyancing", "Conveyancing pass-through receipt"),
        ],
        string="Stand sales move type",
        readonly=True,
        copy=False,
        index=True,
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
