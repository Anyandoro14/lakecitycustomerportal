# -*- coding: utf-8 -*-
"""Consolidate customer receivables on 121000 for an accurate trial balance."""
import logging

from odoo import _, fields, models
from odoo.tools.float_utils import float_compare, float_is_zero, float_round

_logger = logging.getLogger(__name__)

LAKECITY_TRADE_AR_CODE = "121000"
LAKECITY_ORPHAN_AR_PREFIX = "Trade Receivable —"


class ResCompany(models.Model):
    _inherit = "res.company"

    def _lakecity_trade_receivable_account(self):
        """Main trade AR (121000) — sole customer receivable on trial balance."""
        self.ensure_one()
        acc = self._lakecity_account_by_code(LAKECITY_TRADE_AR_CODE)
        if acc:
            return acc
        return (
            self.env["account.account"]
            .sudo()
            .with_company(self)
            .search(
                [
                    ("code", "=", LAKECITY_TRADE_AR_CODE),
                    ("account_type", "=", "asset_receivable"),
                    ("active", "=", True),
                    *self.env["account.account"]._check_company_domain(self),
                ],
                limit=1,
            )
        )

    def _lakecity_orphan_customer_receivable_accounts(self):
        """Per-customer AR rows created by legacy logic — not chart sub-accounts."""
        self.ensure_one()
        main_ar = self._lakecity_trade_receivable_account()
        if not main_ar:
            return self.env["account.account"]
        return (
            self.env["account.account"]
            .sudo()
            .with_company(self)
            .search(
                [
                    ("account_type", "=", "asset_receivable"),
                    ("id", "!=", main_ar.id),
                    ("name", "ilike", LAKECITY_ORPHAN_AR_PREFIX + "%"),
                    *self.env["account.account"]._check_company_domain(self),
                ]
            )
        )

    def _lakecity_partner_ar_balance(self, partner, account=None):
        """Posted AR balance for one partner on main trade receivable (debit normal)."""
        self.ensure_one()
        partner = partner.commercial_partner_id
        account = account or self._lakecity_trade_receivable_account()
        if not account or not partner:
            return 0.0
        self.env.cr.execute(
            """
            SELECT COALESCE(SUM(aml.debit - aml.credit), 0)
              FROM account_move_line aml
              JOIN account_move am ON am.id = aml.move_id
             WHERE aml.account_id = %s
               AND aml.partner_id = %s
               AND am.company_id = %s
               AND am.state = 'posted'
            """,
            (account.id, partner.id, self.id),
        )
        return float(self.env.cr.fetchone()[0] or 0.0)

    def _lakecity_consolidate_orphan_ar_to_main(self):
        """Move legacy per-customer AR postings onto 121000 (SQL; keep partner_id)."""
        self.ensure_one()
        main_ar = self._lakecity_trade_receivable_account()
        if not main_ar:
            _logger.warning("Lakecity AR consolidate: no 121000 for %s", self.display_name)
            return {"lines_moved": 0, "accounts_archived": 0}

        cr = self.env.cr
        cr.execute(
            """
            UPDATE account_move_line AS aml
               SET account_id = %s
              FROM account_move AS am, account_account AS aa
             WHERE aml.move_id = am.id
               AND aml.account_id = aa.id
               AND am.company_id = %s
               AND am.state = 'posted'
               AND aa.id != %s
               AND aa.account_type = 'asset_receivable'
               AND aa.name ILIKE %s
            """,
            (main_ar.id, self.id, main_ar.id, LAKECITY_ORPHAN_AR_PREFIX + "%"),
        )
        line_count = cr.rowcount or 0

        cr.execute(
            """
            UPDATE account_account AS aa
               SET active = FALSE
             WHERE aa.account_type = 'asset_receivable'
               AND aa.id != %s
               AND aa.name ILIKE %s
               AND aa.active IS TRUE
               AND NOT EXISTS (
                    SELECT 1
                      FROM account_move_line AS aml
                      JOIN account_move AS am ON am.id = aml.move_id
                     WHERE aml.account_id = aa.id
                       AND am.state = 'posted'
               )
            """,
            (main_ar.id, LAKECITY_ORPHAN_AR_PREFIX + "%"),
        )
        archived = cr.rowcount or 0
        self.env.invalidate_all()
        return {"lines_moved": line_count, "accounts_archived": archived}

    def _lakecity_clear_bnpl_mirror_moves(self):
        """Remove legacy Dr AR / Cr clearing mirrors that inflate trial balance AR."""
        Contract = self.env["lakecity.loan.contract"].sudo()
        cleared = 0
        for contract in Contract.search([("company_id", "=", self.id)]):
            move = contract.lakecity_future_receivable_move_id
            if move:
                contract._lakecity_clear_future_receivable_gl()
                cleared += 1
        return cleared

    def action_lakecity_repair_trial_balance_ar(self):
        """Consolidate AR onto 121000 and clear duplicate BNPL mirror entries."""
        self.ensure_one()
        consolidate = self._lakecity_consolidate_orphan_ar_to_main()
        mirrors = self._lakecity_clear_bnpl_mirror_moves()
        Contract = self.env["lakecity.loan.contract"].sudo()
        partners_fixed = 0
        for contract in Contract.search([("company_id", "=", self.id), ("partner_id", "!=", False)]):
            contract.partner_id.commercial_partner_id._lakecity_ensure_main_trade_receivable_for_company(
                self
            )
            partners_fixed += 1
        msg = _(
            "Trial balance AR repair: %(lines)s line(s) moved to 121000, "
            "%(archived)s orphan account(s) archived, %(mirrors)s BNPL mirror(s) removed, "
            "%(partners)s customer(s) pointed at main receivable."
        ) % {
            "lines": consolidate.get("lines_moved", 0),
            "archived": consolidate.get("accounts_archived", 0),
            "mirrors": mirrors,
            "partners": partners_fixed,
        }
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Receivables repaired"),
                "message": msg,
                "type": "success",
                "sticky": True,
            },
        }


class LakecityStandAccountingMixin(models.AbstractModel):
    _inherit = "lakecity.stand.accounting.mixin"

    def _lakecity_partner_receivable_account(self):
        """Always main trade receivable 121000."""
        self.ensure_one()
        acc = self.company_id._lakecity_trade_receivable_account()
        if not acc:
            raise UserError(
                _("Main trade receivable account %(code)s is missing for %(company)s.")
                % {"code": LAKECITY_TRADE_AR_CODE, "company": self.company_id.display_name}
            )
        return acc

    def _lakecity_expected_ar_balance(self):
        """Walkthrough target: gross contract minus cash received."""
        self.ensure_one()
        rnd = self.currency_id.rounding
        gross = self.total_with_tax or 0.0
        paid = self.total_paid or 0.0
        return float_round(max(gross - paid, 0.0), precision_rounding=rnd)

    def _lakecity_partner_ar_balance(self):
        self.ensure_one()
        return self.company_id._lakecity_partner_ar_balance(
            self.partner_id.commercial_partner_id
        )

    def _lakecity_verify_ar_after_posting(self, context_label=""):
        """Log when partner AR on 121000 does not match contract balance."""
        self.ensure_one()
        expected = self._lakecity_expected_ar_balance()
        actual = self._lakecity_partner_ar_balance()
        rnd = self.currency_id.rounding
        if float_compare(actual, expected, precision_rounding=rnd) != 0:
            _logger.warning(
                "Lakecity AR mismatch %s contract %s stand %s: GL 121000=%(actual)s expected=%(expected)s",
                context_label,
                self.name,
                self.stand_number,
                extra={"actual": actual, "expected": expected},
            )
        return {"expected": expected, "actual": actual}
