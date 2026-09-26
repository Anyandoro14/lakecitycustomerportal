# -*- coding: utf-8 -*-
"""Bank statement line: three-way stand check before auto-reconcile."""
import logging
import re

from odoo import api, models
from odoo.tools.float_utils import float_compare

_logger = logging.getLogger(__name__)


class AccountBankStatementLine(models.Model):
    _inherit = "account.bank.statement.line"

    @api.model
    def _lakecity_extract_stand_from_bank_text(self, raw):
        text = str(raw or "").strip()
        if not text:
            return ""
        patterns = (
            r"\bstand\s*[#:\-]?\s*(\d+[A-Za-z0-9]*)\b",
            r"\bst\s*[#:\-]?\s*(\d+[A-Za-z0-9]*)\b",
            r"#\s*(\d+[A-Za-z0-9]*)\b",
        )
        Normalize = self.env["lakecity.stand.cost"]._lakecity_normalize_stand_number
        for pat in patterns:
            m = re.search(pat, text, flags=re.IGNORECASE)
            if m and m.group(1):
                stand = Normalize(m.group(1))
                if stand:
                    return stand
        return ""

    def _lakecity_bank_label_text(self):
        self.ensure_one()
        parts = [
            getattr(self, "payment_ref", None) or "",
            getattr(self, "narration", None) or "",
            self.name or "",
            getattr(self, "ref", None) or "",
        ]
        return " ".join(str(p) for p in parts if p)

    def _lakecity_three_way_stand_ok(self, loan_payment, amount_bank, tolerance=None):
        """Return (ok: bool, reason: str|False, stands: dict)."""
        self.ensure_one()
        Normalize = self.env["lakecity.stand.cost"]._lakecity_normalize_stand_number
        stand_portal = Normalize(loan_payment.stand_number)
        partner = loan_payment.partner_id.commercial_partner_id
        contracts = self.env["lakecity.loan.contract"].sudo().search(
            [("partner_id", "child_of", partner.id)],
            limit=20,
        )
        partner_stands = {Normalize(c.stand_number) for c in contracts if c.stand_number}
        stand_partner = stand_portal if stand_portal in partner_stands else (
            next(iter(partner_stands), "") if len(partner_stands) == 1 else ""
        )
        if stand_portal and stand_portal in partner_stands:
            stand_partner = stand_portal
        stand_bank = self._lakecity_extract_stand_from_bank_text(self._lakecity_bank_label_text())

        stands = {
            "stand_portal": stand_portal,
            "stand_partner": stand_partner,
            "stand_bank": stand_bank,
        }
        if not stand_portal or not stand_partner or not stand_bank:
            return False, "missing_stand", stands
        if stand_portal != stand_partner or stand_portal != stand_bank:
            return False, "stand_mismatch", stands

        currency = loan_payment.currency_id or self.company_id.currency_id
        tol = tolerance
        if tol is None:
            tol = currency.rounding if currency else 0.01
        pay_amt = abs(loan_payment.amount or 0.0)
        bank_amt = abs(amount_bank or 0.0)
        if float_compare(pay_amt, bank_amt, precision_rounding=tol) != 0:
            return False, "amount_mismatch", stands
        return True, False, stands

    def _lakecity_log_reconcile_discrepancy(self, reason, stands, loan_payment=None, amount_bank=None):
        self.ensure_one()
        Discrepancy = self.env["lakecity.bank.reconcile.discrepancy"].sudo()
        company = self.company_id
        ar_acc = False
        if hasattr(company, "_lakecity_trade_receivable_account"):
            ar_acc = company._lakecity_trade_receivable_account()
        vals = {
            "company_id": company.id,
            "statement_line_id": self.id,
            "loan_payment_id": loan_payment.id if loan_payment else False,
            "account_payment_id": (
                loan_payment.account_payment_id.id
                if loan_payment and loan_payment.account_payment_id
                else False
            ),
            "receivable_account_id": ar_acc.id if ar_acc else False,
            "stand_portal": stands.get("stand_portal") or False,
            "stand_partner": stands.get("stand_partner") or False,
            "stand_bank": stands.get("stand_bank") or False,
            "amount_payment": loan_payment.amount if loan_payment else 0.0,
            "amount_bank": abs(amount_bank if amount_bank is not None else (self.amount or 0.0)),
            "currency_id": (loan_payment.currency_id or company.currency_id).id,
            "reason": reason,
            "bank_label": (self._lakecity_bank_label_text() or "")[:256],
            "state": "open",
        }
        # Avoid duplicate open rows for the same statement line + reason.
        existing = Discrepancy.search(
            [
                ("statement_line_id", "=", self.id),
                ("reason", "=", reason),
                ("state", "=", "open"),
                ("loan_payment_id", "=", loan_payment.id if loan_payment else False),
            ],
            limit=1,
        )
        if existing:
            existing.write(vals)
            rec = existing
        else:
            rec = Discrepancy.create(vals)
        try:
            self.env["lakecity.daily.exception"].sudo()._lakecity_upsert_from_bank_discrepancy(rec)
        except Exception:  # noqa: BLE001
            _logger.debug("Lakecity daily exception bridge skipped", exc_info=True)
        return rec

    def _lakecity_find_loan_payment_candidates(self):
        """Posted BNPL payments that could match this statement line by amount/partner."""
        self.ensure_one()
        Payment = self.env["lakecity.loan.payment"].sudo()
        amount = abs(self.amount or 0.0)
        if amount <= 0:
            return Payment.browse()
        domain = [
            ("state", "=", "posted"),
            ("company_id", "=", self.company_id.id),
        ]
        currency = self.currency_id or self.company_id.currency_id
        # Amount equality within currency rounding via filtered below.
        candidates = Payment.search(domain, order="payment_date desc, id desc", limit=200)
        tol = currency.rounding if currency else 0.01
        matched = candidates.filtered(
            lambda p: float_compare(abs(p.amount or 0.0), amount, precision_rounding=tol) == 0
        )
        if self.partner_id:
            partner = self.partner_id.commercial_partner_id
            partner_matched = matched.filtered(
                lambda p: p.partner_id.commercial_partner_id == partner
            )
            if partner_matched:
                return partner_matched
        # Prefer candidates whose stand appears in the bank label.
        stand_bank = self._lakecity_extract_stand_from_bank_text(self._lakecity_bank_label_text())
        if stand_bank:
            by_stand = matched.filtered(lambda p: (p.stand_number or "") == stand_bank)
            if by_stand:
                return by_stand
        return matched

    def _lakecity_try_three_way_auto_reconcile(self):
        """Attempt auto-link when three-way stand + amount agree; else log discrepancy.

        Does not invent a parallel payment stack — prefers existing account.payment
        linked to lakecity.loan.payment when present. Native reconcile models still
        handle partner/amount matching; this hook gates silent matches on stand.
        """
        for line in self:
            if getattr(line, "is_reconciled", False):
                continue
            amount_bank = abs(line.amount or 0.0)
            candidates = line._lakecity_find_loan_payment_candidates()
            if not candidates:
                # Only log when a stand token is present (otherwise not a BNPL line).
                stand_bank = line._lakecity_extract_stand_from_bank_text(line._lakecity_bank_label_text())
                if stand_bank:
                    line._lakecity_log_reconcile_discrepancy(
                        "no_candidate",
                        {
                            "stand_portal": "",
                            "stand_partner": "",
                            "stand_bank": stand_bank,
                        },
                        amount_bank=amount_bank,
                    )
                continue

            matched_ok = self.env["lakecity.loan.payment"]
            for pay in candidates:
                ok, reason, stands = line._lakecity_three_way_stand_ok(pay, amount_bank)
                if ok:
                    matched_ok |= pay
                else:
                    line._lakecity_log_reconcile_discrepancy(
                        reason or "stand_mismatch",
                        stands,
                        loan_payment=pay,
                        amount_bank=amount_bank,
                    )

            if len(matched_ok) != 1:
                continue

            pay = matched_ok[0]
            # Set partner from the loan when statement line has none — helps native matching.
            if not line.partner_id and pay.partner_id:
                try:
                    line.partner_id = pay.partner_id.commercial_partner_id
                except Exception:  # noqa: BLE001 — statement may be locked
                    _logger.debug("Lakecity: could not set partner on statement line %s", line.id)

            # When an account.payment exists, expose payment_ref with stand for reconcile models.
            ap = pay.account_payment_id
            if ap and hasattr(line, "payment_ref") and not (line.payment_ref or "").strip():
                try:
                    line.payment_ref = ap.payment_reference or pay.reference or pay.name
                except Exception:  # noqa: BLE001
                    pass

            _logger.info(
                "Lakecity three-way stand OK for statement line %s ↔ BNPL %s (stand %s)",
                line.id,
                pay.display_name,
                pay.stand_number,
            )

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        try:
            lines._lakecity_try_three_way_auto_reconcile()
        except Exception:  # noqa: BLE001 — never block bank import
            _logger.exception("Lakecity three-way bank reconcile hook failed")
        return lines
