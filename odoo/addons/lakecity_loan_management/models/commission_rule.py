# -*- coding: utf-8 -*-
"""Commission rules for Mshambadzi (5% group), Ethan, Carol — config-driven.

Payment timing defaults to monthly until Alex/Tanaka decide immediate vs monthly.
Accrues Dr Agent Commissions 650080 / Cr agent payable (partner AP).
"""
import logging

from odoo import _, api, fields, models
from odoo.tools.float_utils import float_is_zero, float_round

_logger = logging.getLogger(__name__)

COMMISSION_EXPENSE_CODE = "650080"


class LakecityCommissionRule(models.Model):
    _name = "lakecity.commission.rule"
    _description = "Stand sales commission rule"
    _order = "sequence, id"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    agent_partner_id = fields.Many2one(
        "res.partner",
        string="Agent / payee",
        required=True,
        help="Mshambadzi group entity, Ethan, Carol, etc.",
    )
    agent_code = fields.Selection(
        [
            ("mshambadzi", "Mshambadzi (5% group)"),
            ("ethan", "Ethan"),
            ("carol", "Carol"),
            ("other", "Other"),
        ],
        default="other",
        required=True,
    )
    rate_percent = fields.Float(
        string="Rate %",
        default=5.0,
        help="Percent of stand payment amount (gross). Mshambadzi group default 5%.",
    )
    payment_timing = fields.Selection(
        [
            ("monthly", "Monthly (default until schedule decided)"),
            ("immediate", "Immediate on each receipt"),
        ],
        default="monthly",
        required=True,
        help="Outstanding: Alex/Tanaka to confirm immediate vs monthly payout.",
    )
    stand_number = fields.Char(help="Optional stand filter; blank = all stands.")
    phase_id = fields.Many2one("lakecity.stand.phase", string="Phase filter")
    expense_account_id = fields.Many2one(
        "account.account",
        string="Commission expense",
        help="Defaults to COA 650080 Agent Commissions - Stand Sales.",
    )
    payable_account_id = fields.Many2one(
        "account.account",
        string="Commission payable",
        help="Defaults to agent partner payable / main AP.",
    )
    notes = fields.Text()

    @api.model
    def _lakecity_default_expense_account(self, company):
        return company._lakecity_account_by_code(COMMISSION_EXPENSE_CODE)

    @api.model
    def _lakecity_rules_for_payment(self, payment):
        company = payment.company_id
        stand = (payment.stand_number or "").strip()
        phase = payment.lakecity_stand_phase_id
        rules = self.sudo().search(
            [("active", "=", True), ("company_id", "=", company.id)],
            order="sequence, id",
        )
        matched = self.browse()
        for rule in rules:
            if rule.stand_number and (rule.stand_number or "").strip() != stand:
                continue
            if rule.phase_id and phase and rule.phase_id != phase:
                continue
            if rule.phase_id and not phase:
                continue
            matched |= rule
        return matched

    @api.model
    def _lakecity_accrue_for_payment(self, payment):
        """Accrue commission JE(s) for matching rules. Immediate posts now; monthly flags only."""
        payment.ensure_one()
        rules = self._lakecity_rules_for_payment(payment)
        if not rules:
            return self.browse()
        contract = payment.contract_id
        company = payment.company_id
        amount_base = payment.amount or 0.0
        if float_is_zero(amount_base, precision_rounding=payment.currency_id.rounding):
            return rules

        for rule in rules:
            commission = float_round(
                amount_base * (rule.rate_percent or 0.0) / 100.0,
                precision_rounding=payment.currency_id.rounding,
            )
            if float_is_zero(commission, precision_rounding=payment.currency_id.rounding):
                continue
            if rule.payment_timing == "monthly":
                _logger.info(
                    "Lakecity commission %s for payment %s amount %s timed=monthly — "
                    "accrual deferred (schedule TBD).",
                    rule.display_name,
                    payment.display_name,
                    commission,
                )
                # Record a draft activity note via discrepancy-style log on payment note.
                note = (payment.note or "") + _(
                    "\n[Commission pending monthly] %(agent)s %(rate)s%% = %(amt)s"
                ) % {
                    "agent": rule.agent_partner_id.display_name,
                    "rate": rule.rate_percent,
                    "amt": commission,
                }
                payment.with_context(lakecity_skip_bank_payment_write=True).write({"note": note})
                continue

            expense = rule.expense_account_id or self._lakecity_default_expense_account(company)
            payable = rule.payable_account_id
            if not payable and rule.agent_partner_id.property_account_payable_id:
                payable = rule.agent_partner_id.property_account_payable_id
            if not expense or not payable:
                _logger.warning(
                    "Lakecity commission rule %s missing expense/payable — skip",
                    rule.display_name,
                )
                continue
            ref = _("Commission %(agent)s — Stand %(stand)s · %(pay)s") % {
                "agent": rule.agent_partner_id.display_name,
                "stand": payment.stand_number or "?",
                "pay": payment.name,
            }
            try:
                contract._lakecity_create_stand_move(
                    contract._lakecity_build_move_lines(
                        [
                            (expense, commission, 0.0, False),
                            (payable, 0.0, commission, rule.agent_partner_id.id),
                        ],
                        ref,
                    ),
                    ref,
                    "payment_revenue_vat",
                    move_date=payment.payment_date,
                )
            except Exception:  # noqa: BLE001
                _logger.exception("Commission accrual failed for payment %s", payment.id)
        return rules
