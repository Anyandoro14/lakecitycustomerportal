# -*- coding: utf-8 -*-
"""Voltage / Waltage (special-client) posting map — config-driven; maps start empty.

Tanaka fills partner → CABS liquidity → revenue → Voltage creditor partner.
Posting runs on BNPL payment after stand-sales receipt JE when a row matches.
"""
import logging

from odoo import _, api, fields, models
from odoo.tools.float_utils import float_is_zero

_logger = logging.getLogger(__name__)


class LakecitySpecialClientMap(models.Model):
    _name = "lakecity.special.client.map"
    _description = "Special client posting map (Voltage / Waltage)"
    _order = "name, id"

    name = fields.Char(required=True, help="Label, e.g. Voltage client group A")
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    partner_id = fields.Many2one(
        "res.partner",
        string="Customer partner",
        required=True,
        help="BNPL customer whose receipts trigger this map.",
    )
    stand_number = fields.Char(
        help="Optional stand filter. Blank = all stands for this partner.",
    )
    cabs_account_id = fields.Many2one(
        "account.account",
        string="CABS / liquidity account",
        required=True,
        help="Must be an existing COA liquidity account (e.g. 101410 / Waltich 101412).",
    )
    revenue_account_id = fields.Many2one(
        "account.account",
        string="Revenue account",
        help="Optional override; blank keeps standard stand-sales revenue path.",
    )
    voltage_creditor_partner_id = fields.Many2one(
        "res.partner",
        string="Voltage creditor partner",
        help="Creditor that receives the related payable when Tanaka’s template is ready.",
    )
    creditor_account_id = fields.Many2one(
        "account.account",
        string="Creditor / payable account",
        help="Optional payable GL (use existing COA payable). Required to post creditor JE.",
    )
    notes = fields.Text(
        help="Tanaka: document bank-specific creditor entry template here until XML/API exists."
    )

    _lakecity_special_client_partner_stand_uniq = models.Constraint(
        "unique(company_id, partner_id, stand_number)",
        "A special-client map already exists for this partner/stand.",
    )

    @api.model
    def _lakecity_find_map_for_payment(self, payment):
        partner = payment.partner_id.commercial_partner_id
        company = payment.company_id
        stand = (payment.stand_number or "").strip()
        Map = self.sudo()
        domain = [
            ("active", "=", True),
            ("company_id", "=", company.id),
            ("partner_id", "=", partner.id),
        ]
        rows = Map.search(domain)
        if stand:
            exact = rows.filtered(lambda r: (r.stand_number or "").strip() == stand)
            if exact:
                return exact[:1]
        any_stand = rows.filtered(lambda r: not (r.stand_number or "").strip())
        return any_stand[:1]

    @api.model
    def _lakecity_post_for_payment(self, payment):
        """Post optional creditor JE for mapped Voltage clients. No-op when map empty."""
        payment.ensure_one()
        mapping = self._lakecity_find_map_for_payment(payment)
        if not mapping:
            return self.browse()
        if not mapping.creditor_account_id or not mapping.voltage_creditor_partner_id:
            _logger.info(
                "Lakecity special-client map %s matched payment %s but creditor "
                "account/partner incomplete — skipping creditor JE (await Tanaka template).",
                mapping.display_name,
                payment.display_name,
            )
            return mapping

        amount = payment.amount or 0.0
        if float_is_zero(amount, precision_rounding=payment.currency_id.rounding):
            return mapping

        contract = payment.contract_id
        company = payment.company_id
        # Until Tanaka template: accrue payable when creditor_account is set.
        expense = mapping.revenue_account_id or company._lakecity_account_by_code("650080")
        if not expense:
            _logger.warning(
                "Lakecity special-client map %s: no debit account for creditor accrual",
                mapping.display_name,
            )
            return mapping

        ref = _("Voltage creditor — Stand %s · %s") % (
            payment.stand_number or "?",
            payment.name,
        )
        try:
            contract._lakecity_create_stand_move(
                contract._lakecity_build_move_lines(
                    [
                        (expense, amount, 0.0, False),
                        (
                            mapping.creditor_account_id,
                            0.0,
                            amount,
                            mapping.voltage_creditor_partner_id.id,
                        ),
                    ],
                    ref,
                ),
                ref,
                "payment_revenue_vat",
                move_date=payment.payment_date,
            )
        except Exception:  # noqa: BLE001
            _logger.exception(
                "Lakecity special-client creditor post failed for payment %s", payment.id
            )
        return mapping
