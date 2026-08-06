# -*- coding: utf-8 -*-
import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools.float_utils import float_compare, float_is_zero, float_round

_logger = logging.getLogger(__name__)

LAKECITY_STAND_ACCOUNT_CODES = {
    "receivable": "121000",
    "defaulted_receivable": "121015",
    "inventory_available": "110110",
    "inventory_allocated": "110120",
    "contract_liability": "212010",
    "deferred_vat": "251020",
    "vat_output": "251010",
    "revenue": "401000",
    "forfeiture_income": "406000",
    "admin_fee_income": "405000",
    "cancellation_clearing": "212080",
    "refunds_payable": "212090",
    "cos": "501000",
    "aos_payable": "213010",
    "conveyancing_payable": "213020",
    "bank_usd_main": "101410",
}


class LakecityStandAccountingMixin(models.AbstractModel):
    _name = "lakecity.stand.accounting.mixin"
    _description = "Lake City stand sale journal entry helpers (ZIMRA-aligned walkthrough)"

    # ------------------------------------------------------------------
    # Amount splits (walkthrough formulas)
    # ------------------------------------------------------------------

    def _lakecity_vat_factor(self):
        self.ensure_one()
        return 1.0 + ((self.tax_rate or 0.0) / 100.0)

    def _lakecity_net_contract_price(self):
        self.ensure_one()
        base = self.total_price or 0.0
        factor = self._lakecity_vat_factor()
        if self.is_vat_inclusive:
            return float_round(base / factor, precision_rounding=self.currency_id.rounding)
        return base

    def _lakecity_vat_on_contract(self):
        self.ensure_one()
        gross = self.total_with_tax or 0.0
        net = self._lakecity_net_contract_price()
        return float_round(gross - net, precision_rounding=self.currency_id.rounding)

    def _lakecity_split_gross_payment(self, gross):
        """Split a gross receipt into net revenue and VAT (walkthrough deposit/instalment logic)."""
        self.ensure_one()
        rnd = self.currency_id.rounding
        factor = self._lakecity_vat_factor()
        if float_is_zero(gross, precision_rounding=rnd):
            return 0.0, 0.0
        if self.is_vat_inclusive or (self.tax_rate or 0.0):
            net = float_round(gross / factor, precision_rounding=rnd)
            vat = float_round(gross - net, precision_rounding=rnd)
            return net, vat
        return gross, 0.0

    def _lakecity_cos_for_net(self, net_portion):
        self.ensure_one()
        rnd = self.currency_id.rounding
        stand_cost = self.stand_cost or 0.0
        net_contract = self._lakecity_net_contract_price()
        if float_is_zero(stand_cost, precision_rounding=rnd) or float_is_zero(net_contract, precision_rounding=rnd):
            return 0.0
        cos = float_round(stand_cost * (net_portion / net_contract), precision_rounding=rnd)
        return cos

    def _lakecity_company_stand_accounting_enabled(self):
        self.ensure_one()
        return bool(self.company_id.lakecity_stand_sales_accounting_enabled)

    def _lakecity_stand_account(self, code):
        self.ensure_one()
        return self.company_id._lakecity_account_by_code(code)

    def _lakecity_stand_journal(self):
        self.ensure_one()
        return self.company_id._lakecity_stand_sales_journal()

    def _lakecity_collections_bank_account(self):
        self.ensure_one()
        company = self.company_id
        journal = company.lakecity_bnpl_collections_journal_id
        if journal and journal.default_account_id:
            return journal.default_account_id
        acc = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["bank_usd_main"])
        if not acc:
            journal = self.env["account.journal"].sudo().search(
                [("company_id", "=", company.id), ("type", "in", ("bank", "cash"))],
                limit=1,
            )
            if journal and journal.default_account_id:
                return journal.default_account_id
        return acc

    def _lakecity_create_stand_move(self, line_specs, ref, purpose, journal=None, move_date=None):
        self.ensure_one()
        Move = self.env["account.move"].sudo()
        journal = journal or self._lakecity_stand_journal()
        if not journal:
            raise UserError(_("Configure the Lake City Stand Sales journal on %s.") % self.company_id.display_name)
        move_date = move_date or fields.Date.context_today(self)
        partner = self.partner_id.commercial_partner_id
        phase_id = self.lakecity_stand_phase_id.id if self.lakecity_stand_phase_id else False
        line_payload = []
        for ln in line_specs:
            payload = dict(ln)
            if phase_id:
                payload["lakecity_stand_phase_id"] = phase_id
            line_payload.append((0, 0, payload))
        vals = {
            "move_type": "entry",
            "journal_id": journal.id,
            "company_id": self.company_id.id,
            "currency_id": self.currency_id.id,
            "date": move_date,
            "ref": ref,
            "partner_id": partner.id,
            "lakecity_loan_contract_id": self.id,
            "lakecity_stand_phase_id": phase_id,
            "lakecity_stand_move_purpose": purpose,
            "line_ids": line_payload,
        }
        move = Move.create(vals)
        move.action_post()
        return move

    def _lakecity_build_move_lines(self, pairs, label):
        """pairs: list of (account, debit, credit, partner_id or False)."""
        lines = []
        for account, debit, credit, partner_id in pairs:
            if not account:
                continue
            if float_is_zero(debit, precision_rounding=self.currency_id.rounding) and float_is_zero(
                credit, precision_rounding=self.currency_id.rounding
            ):
                continue
            lines.append(
                {
                    "account_id": account.id,
                    "partner_id": partner_id or False,
                    "name": label,
                    "debit": debit,
                    "credit": credit,
                }
            )
        return lines

    def _lakecity_post_initial_contract_recognition(self):
        """Step 02 JE1 — Dr AR gross / Cr contract liability net / Cr deferred VAT."""
        self.ensure_one()
        if self.lakecity_initial_contract_move_id:
            return self.lakecity_initial_contract_move_id
        if not self._lakecity_company_stand_accounting_enabled():
            return False

        ar = self._lakecity_partner_receivable_account()
        liability = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["contract_liability"])
        deferred_vat = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["deferred_vat"])
        for acc, label in (
            (ar, _("receivable")),
            (liability, _("contract liability")),
            (deferred_vat, _("deferred VAT")),
        ):
            if not acc:
                raise UserError(
                    _("Missing GL account for stand sales (%(label)s). Import the Lake City chart of accounts.")
                    % {"label": label}
                )

        gross = self.total_with_tax or 0.0
        net = self._lakecity_net_contract_price()
        vat = self._lakecity_vat_on_contract()
        partner = self.partner_id.commercial_partner_id.id
        label = _("Initial contract — %s stand %s") % (self.name, self.stand_number or "")
        lines = self._lakecity_build_move_lines(
            [
                (ar, gross, 0.0, partner),
                (liability, 0.0, net, False),
                (deferred_vat, 0.0, vat, False),
            ],
            label,
        )
        move = self._lakecity_create_stand_move(lines, self.name, "initial_contract")
        self.with_context(skip_lakecity_bnpl_gl_sync=True).write({"lakecity_initial_contract_move_id": move.id})
        return move

    def _lakecity_unlink_stand_move(self, move):
        """Draft and unlink a posted stand-sales move (opening-balance force repost)."""
        if not move:
            return
        move = move.sudo()
        try:
            if move.state == "posted":
                move.button_draft()
            if move.state in ("draft", "cancel"):
                move.unlink()
        except Exception as err:
            _logger.warning("Lakecity: could not unlink stand move id=%s: %s", move.id, err)

    def _lakecity_clear_opening_balance_moves(self, cutoff_date=None):
        """Remove prior opening JEs and **pre-cutover** BNPL payments for force repost.

        Keeps receipts on/after ``cutoff_date`` (e.g. 2026+ collections). Only removes:
        - payments dated before the cutover, and
        - prior lumped ``opening-balance-*`` receipts (so force can repost them).
        """
        self.ensure_one()
        Payment = self.env["lakecity.loan.payment"].sudo()
        cutoff_date = fields.Date.to_date(cutoff_date) if cutoff_date else False
        payments = Payment.search([("contract_id", "=", self.id)])
        to_clear = Payment.browse()
        for pay in payments:
            uid = (pay.external_uid or "").strip()
            if uid.startswith("opening-balance-"):
                to_clear |= pay
                continue
            if cutoff_date:
                if pay.payment_date and pay.payment_date < cutoff_date:
                    to_clear |= pay
            else:
                # No cutoff supplied — legacy full clear.
                to_clear |= pay
        cleared = len(to_clear)
        for pay in to_clear:
            self._lakecity_unlink_stand_move(pay.lakecity_receipt_move_id)
            self._lakecity_unlink_stand_move(pay.lakecity_revenue_move_id)
            self._lakecity_unlink_stand_move(pay.lakecity_cos_move_id)
            if pay.account_payment_id:
                try:
                    ap = pay.account_payment_id.sudo()
                    if ap.state in ("paid", "in_process", "posted"):
                        if hasattr(ap, "action_draft"):
                            ap.action_draft()
                        elif hasattr(ap, "button_draft"):
                            ap.button_draft()
                    if ap.state in ("draft", "cancel"):
                        ap.unlink()
                except Exception as err:
                    _logger.warning(
                        "Lakecity: could not remove bank payment for %s: %s",
                        pay.display_name,
                        err,
                    )
            pay.with_context(lakecity_skip_bank_payment_write=True).unlink()
        if self.lakecity_initial_contract_move_id:
            self._lakecity_unlink_stand_move(self.lakecity_initial_contract_move_id)
        if self.lakecity_inventory_reclass_move_id:
            self._lakecity_unlink_stand_move(self.lakecity_inventory_reclass_move_id)
            self.with_context(skip_lakecity_bnpl_gl_sync=True).write(
                {"lakecity_inventory_reclass_move_id": False}
            )
        self.with_context(skip_lakecity_bnpl_gl_sync=True).write(
            {
                "lakecity_initial_contract_move_id": False,
                "lakecity_deposit_accounting_done": False,
                "lakecity_revenue_recognized": 0.0,
                "lakecity_vat_released": 0.0,
                "lakecity_cos_recognized": 0.0,
            }
        )
        # Reset installment paid, then rebuild from remaining (post-cutover) payments +
        # the new opening-balance receipt that force will post next.
        if self.installment_ids:
            self.installment_ids.sudo().write({"amount_paid": 0.0})
            self.installment_ids.action_lakecity_refresh_stored_computes()
        self._rebuild_payment_allocations()
        return cleared

    def _lakecity_post_initial_contract_recognition_amounts(self, gross, contract_liability, deferred_vat_amount, move_date=None):
        """Step 02 JE1 using explicit sheet amounts (opening-balance migration)."""
        self.ensure_one()
        if self.lakecity_initial_contract_move_id:
            return self.lakecity_initial_contract_move_id
        if not self._lakecity_company_stand_accounting_enabled():
            return False

        ar = self._lakecity_partner_receivable_account()
        liability = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["contract_liability"])
        deferred_vat_acc = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["deferred_vat"])
        for acc, label in (
            (ar, _("receivable")),
            (liability, _("contract liability")),
            (deferred_vat_acc, _("deferred VAT")),
        ):
            if not acc:
                raise UserError(
                    _("Missing GL account for stand sales (%(label)s). Import the Lake City chart of accounts.")
                    % {"label": label}
                )

        partner = self.partner_id.commercial_partner_id.id
        label = _("Initial contract — %s stand %s") % (self.name, self.stand_number or "")
        lines = self._lakecity_build_move_lines(
            [
                (ar, gross, 0.0, partner),
                (liability, 0.0, contract_liability, False),
                (deferred_vat_acc, 0.0, deferred_vat_amount, False),
            ],
            label,
        )
        move = self._lakecity_create_stand_move(
            lines,
            self.name,
            "initial_contract",
            move_date=move_date,
        )
        self.with_context(skip_lakecity_bnpl_gl_sync=True).write({"lakecity_initial_contract_move_id": move.id})
        return move

    def _lakecity_post_opening_balance_migration(
        self,
        gross,
        contract_liability,
        deferred_vat_amount,
        total_paid,
        payment_date=None,
        force=False,
    ):
        """Post walkthrough opening balances: JE1 + receipt/revenue for sheet TOTAL PAID.

        Balance figures are supplied by the Collection Schedule (Google Sheet SoT), not by
        recomputing from existing Odoo contract balances. This module stores the payment
        schedule and payment amounts for arrears / prepayments after cutover.

        ``gross`` is the full contract receivable (sheet TOTAL PRICE).
        ``contract_liability`` and ``deferred_vat_amount`` map to sheet Columns O and P
        (for inclusive VAT, Column O net liability = O + P).

        Use ``payment_date`` as the GL cutover date (e.g. 2026-01-01). When ``force``
        is True, prior opening/initial JEs and **pre-cutover** payments (plus prior
        ``opening-balance-*`` lumps) are cleared and reposted; receipts on/after the
        cutover date are kept.
        """
        self.ensure_one()
        if not self._lakecity_company_stand_accounting_enabled():
            return {"skipped": True, "reason": "stand_sales_accounting_disabled"}

        rnd = self.currency_id.rounding
        # JSON API may pass ISO strings; Date.to_string() requires a date object.
        payment_date = fields.Date.to_date(payment_date) if payment_date else fields.Date.context_today(self)
        payments_cleared = 0
        if force:
            payments_cleared = self._lakecity_clear_opening_balance_moves(cutoff_date=payment_date) or 0
        if float_compare(self.tax_rate or 0.0, 15.5, precision_rounding=0.01) != 0:
            self.with_context(skip_lakecity_bnpl_gl_sync=True).write({"tax_rate": 15.5})
        # Sheet TOTAL PRICE is the receivable gross (CL + VAT). Keep Odoo total_with_tax aligned.
        if not self.is_vat_inclusive:
            self.with_context(skip_lakecity_bnpl_gl_sync=True).write({"is_vat_inclusive": True})

        initial_move = self._lakecity_post_initial_contract_recognition_amounts(
            gross,
            contract_liability,
            deferred_vat_amount,
            move_date=payment_date,
        )

        payment_move_ids = []
        paid = float(total_paid or 0.0)
        if not float_is_zero(paid, precision_rounding=rnd):
            Payment = self.env["lakecity.loan.payment"].sudo()
            ext_uid = "opening-balance-%s" % (self.stand_number or self.id)
            payment = Payment.search([("external_uid", "=", ext_uid)], limit=1)
            vals = {
                "external_uid": ext_uid,
                "contract_id": self.id,
                "payment_date": payment_date,
                "amount": paid,
                "source": "manual",
                "reference": _("Opening balance migration — stand %s") % (self.stand_number or ""),
                "state": "posted",
            }
            if payment:
                payment.with_context(lakecity_skip_bank_payment_write=True).write(vals)
            else:
                payment = Payment.create(vals)

            if not payment.lakecity_stand_accounting_done:
                ref = _("%(loan)s · opening balance") % {"loan": self.name}
                self._lakecity_post_stand_payment_moves(paid, payment_date, ref, payment=payment)
                payment.write({"lakecity_stand_accounting_done": True})

            if self.deposit_amount and not self.lakecity_deposit_accounting_done:
                self.write({"lakecity_deposit_accounting_done": True})

            payment_move_ids = [
                mid
                for mid in (
                    payment.lakecity_receipt_move_id.id,
                    payment.lakecity_revenue_move_id.id,
                    payment.lakecity_cos_move_id.id,
                )
                if mid
            ]
            self._rebuild_payment_allocations()
            self._lakecity_update_recognized_totals()

        if self.state == "draft":
            self.with_context(skip_lakecity_bnpl_gl_sync=True).write({"state": "active"})

        self._lakecity_clear_future_receivable_gl()
        ar_check = self._lakecity_verify_ar_after_posting("opening_balance")
        target_ar = ar_check["expected"]
        return {
            "initial_move_id": initial_move.id if initial_move else False,
            "payment_move_ids": payment_move_ids,
            "target_accounts_receivable": target_ar,
            "accounts_receivable_gl": ar_check["actual"],
            "contract_total_paid": self.total_paid,
            "contract_current_balance": self.current_balance,
            "payments_cleared": payments_cleared,
            "force": bool(force),
            "payment_date": fields.Date.to_string(payment_date),
            "gross": gross,
            "total_paid": paid,
        }

    def _lakecity_post_inventory_reclass(self):
        """Step 02 optional JE2 — Dr allocated inventory / Cr available inventory at stand cost."""
        self.ensure_one()
        if self.lakecity_inventory_reclass_move_id:
            return self.lakecity_inventory_reclass_move_id
        if not self._lakecity_company_stand_accounting_enabled():
            return False
        if not self.company_id.lakecity_stand_inventory_reclass_enabled:
            return False
        cost = self.stand_cost or 0.0
        if float_is_zero(cost, precision_rounding=self.currency_id.rounding):
            return False

        allocated = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["inventory_allocated"])
        available = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["inventory_available"])
        if not allocated or not available:
            _logger.warning("Lakecity stand sales: skip inventory reclass — inventory accounts missing on %s", self.name)
            return False

        label = _("Inventory reclass — stand %s") % (self.stand_number or self.name)
        lines = self._lakecity_build_move_lines(
            [(allocated, cost, 0.0, False), (available, 0.0, cost, False)],
            label,
        )
        move = self._lakecity_create_stand_move(lines, self.name, "inventory_reclass")
        self.write({"lakecity_inventory_reclass_move_id": move.id})
        return move

    def _lakecity_post_stand_payment_moves(self, gross, move_date, ref, payment=None):
        """Post receipt, revenue/VAT, and COS moves for a gross payment amount."""
        self.ensure_one()
        if float_is_zero(gross, precision_rounding=self.currency_id.rounding):
            return

        net, vat = self._lakecity_split_gross_payment(gross)
        cos = self._lakecity_cos_for_net(net)
        ar = self._lakecity_partner_receivable_account()
        bank = self._lakecity_collections_bank_account()
        liability = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["contract_liability"])
        deferred_vat = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["deferred_vat"])
        revenue = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["revenue"])
        vat_output = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["vat_output"])
        cos_acc = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["cos"])
        inventory = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["inventory_allocated"])
        partner_id = self.partner_id.commercial_partner_id.id

        collections_journal = self.company_id.lakecity_bnpl_collections_journal_id
        bank_journal = collections_journal
        if not bank_journal:
            bank_journal = self.env["account.journal"].sudo().search(
                [("company_id", "=", self.company_id.id), ("type", "in", ("bank", "cash"))],
                limit=1,
            )

        if bank and ar:
            receipt_move = self._lakecity_create_stand_move(
                self._lakecity_build_move_lines(
                    [(bank, gross, 0.0, False), (ar, 0.0, gross, partner_id)],
                    _("Receipt — %s") % ref,
                ),
                ref,
                "payment_receipt",
                journal=bank_journal,
                move_date=move_date,
            )
            if payment:
                payment.write({"lakecity_receipt_move_id": receipt_move.id})

        stand_journal = self._lakecity_stand_journal()
        revenue_lines = self._lakecity_build_move_lines(
            [
                (liability, net, 0.0, False),
                (deferred_vat, vat, 0.0, False),
                (revenue, 0.0, net, False),
                (vat_output, 0.0, vat, False),
            ],
            _("Revenue/VAT release — %s") % ref,
        )
        if revenue_lines:
            revenue_move = self._lakecity_create_stand_move(
                revenue_lines,
                ref,
                "payment_revenue_vat",
                journal=stand_journal,
                move_date=move_date,
            )
            if payment:
                payment.write({"lakecity_revenue_move_id": revenue_move.id})

        if cos_acc and inventory and not float_is_zero(cos, precision_rounding=self.currency_id.rounding):
            cos_move = self._lakecity_create_stand_move(
                self._lakecity_build_move_lines(
                    [(cos_acc, cos, 0.0, False), (inventory, 0.0, cos, False)],
                    _("COS — %s") % ref,
                ),
                ref,
                "payment_cos",
                journal=stand_journal,
                move_date=move_date,
            )
            if payment:
                payment.write({"lakecity_cos_move_id": cos_move.id})

    def _lakecity_post_deposit_accounting(self):
        """Post walkthrough deposit/first-instalment JEs when deposit_amount is on the contract."""
        self.ensure_one()
        if self.lakecity_deposit_accounting_done:
            return
        gross = self.deposit_amount or 0.0
        if float_is_zero(gross, precision_rounding=self.currency_id.rounding):
            return
        ref = _("%(loan)s · deposit") % {"loan": self.name}
        self._lakecity_post_stand_payment_moves(gross, fields.Date.context_today(self), ref)
        self.write({"lakecity_deposit_accounting_done": True})
        self._lakecity_update_recognized_totals()

    def _lakecity_post_payment_accounting(self, payment):
        """Steps 03/05/08 — receipt, revenue/VAT release, and COS for one BNPL payment."""
        self.ensure_one()
        payment.ensure_one()
        if not self._lakecity_company_stand_accounting_enabled():
            return
        if payment.lakecity_stand_accounting_done:
            return

        gross = payment.amount or 0.0
        if (
            self.lakecity_deposit_accounting_done
            and not float_is_zero(self.deposit_amount or 0.0, precision_rounding=self.currency_id.rounding)
            and float_compare(gross, self.deposit_amount, precision_rounding=self.currency_id.rounding) == 0
        ):
            payment.write({"lakecity_stand_accounting_done": True})
            return

        if float_is_zero(gross, precision_rounding=self.currency_id.rounding):
            payment.write({"lakecity_stand_accounting_done": True})
            return

        ref = _("%(loan)s · %(pay)s") % {"loan": self.name, "pay": payment.name}
        self._lakecity_post_stand_payment_moves(gross, payment.payment_date, ref, payment=payment)
        payment.write({"lakecity_stand_accounting_done": True})
        self._lakecity_update_recognized_totals()

    def _lakecity_update_recognized_totals(self):
        for rec in self:
            net_total = 0.0
            vat_total = 0.0
            cos_total = 0.0
            for pay in rec.payment_ids.filtered(lambda p: p.state == "posted" and p.lakecity_stand_accounting_done):
                net, vat = rec._lakecity_split_gross_payment(pay.amount)
                net_total += net
                vat_total += vat
                cos_total += rec._lakecity_cos_for_net(net)
            if rec.lakecity_deposit_accounting_done and rec.deposit_amount:
                net, vat = rec._lakecity_split_gross_payment(rec.deposit_amount)
                net_total += net
                vat_total += vat
                cos_total += rec._lakecity_cos_for_net(net)
            rec.write(
                {
                    "lakecity_revenue_recognized": net_total,
                    "lakecity_vat_released": vat_total,
                    "lakecity_cos_recognized": cos_total,
                }
            )

    def _lakecity_post_forfeiture_accounting(self):
        """Step 11 — clear unpaid balances, reclass revenue, reverse COS."""
        self.ensure_one()
        if not self._lakecity_company_stand_accounting_enabled():
            return
        if self.lakecity_forfeiture_move_ids:
            raise UserError(_("Forfeiture accounting was already posted for this contract."))

        net_contract = self._lakecity_net_contract_price()
        gross_contract = self.total_with_tax or 0.0
        net_rec = self.lakecity_revenue_recognized or 0.0
        cos_rec = self.lakecity_cos_recognized or 0.0
        vat_moved = self.lakecity_vat_released or 0.0
        liability_remaining = float_round(net_contract - net_rec, precision_rounding=self.currency_id.rounding)
        total_deferred = self._lakecity_vat_on_contract()
        deferred_remaining = float_round(total_deferred - vat_moved, precision_rounding=self.currency_id.rounding)
        gross_paid = self.total_paid or 0.0
        gross_remaining = float_round(gross_contract - gross_paid, precision_rounding=self.currency_id.rounding)

        ar = self._lakecity_partner_receivable_account()
        liability = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["contract_liability"])
        deferred_vat = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["deferred_vat"])
        revenue = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["revenue"])
        forfeiture = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["forfeiture_income"])
        cos_acc = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["cos"])
        inventory = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["inventory_allocated"])
        partner_id = self.partner_id.commercial_partner_id.id
        ref = _("Forfeiture — %s") % self.name
        moves = []

        clear_lines = self._lakecity_build_move_lines(
            [
                (liability, liability_remaining, 0.0, False),
                (deferred_vat, deferred_remaining, 0.0, False),
                (ar, 0.0, liability_remaining + deferred_remaining, partner_id),
            ],
            _("Clear unpaid balance — %s") % ref,
        )
        if clear_lines:
            moves.append(self._lakecity_create_stand_move(clear_lines, ref, "forfeiture_clear"))

        if net_rec and revenue and forfeiture:
            reclass_lines = self._lakecity_build_move_lines(
                [(revenue, net_rec, 0.0, False), (forfeiture, 0.0, net_rec, False)],
                _("Reclass revenue to forfeiture — %s") % ref,
            )
            moves.append(self._lakecity_create_stand_move(reclass_lines, ref, "forfeiture_revenue"))

        if cos_rec and cos_acc and inventory:
            reverse_lines = self._lakecity_build_move_lines(
                [(inventory, cos_rec, 0.0, False), (cos_acc, 0.0, cos_rec, False)],
                _("Reverse COS — %s") % ref,
            )
            moves.append(self._lakecity_create_stand_move(reverse_lines, ref, "forfeiture_cos"))

        if moves:
            self.write({"lakecity_forfeiture_move_ids": [(6, 0, [m.id for m in moves])]})
        self.write({"state": "defaulted"})

    def _lakecity_post_cancellation_accounting(self, admin_fee_percent=0.10):
        """Step 12 — reverse revenue/COS, admin fee, refund payable."""
        self.ensure_one()
        if not self._lakecity_company_stand_accounting_enabled():
            return
        if self.lakecity_cancellation_move_ids:
            raise UserError(_("Cancellation accounting was already posted for this contract."))

        gross_paid = self.total_paid or 0.0
        net_rec = self.lakecity_revenue_recognized or 0.0
        cos_rec = self.lakecity_cos_recognized or 0.0
        admin_fee = float_round(gross_paid * (admin_fee_percent or 0.0), precision_rounding=self.currency_id.rounding)
        refund = float_round(gross_paid - admin_fee, precision_rounding=self.currency_id.rounding)

        revenue = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["revenue"])
        clearing = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["cancellation_clearing"])
        admin = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["admin_fee_income"])
        refunds_pay = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["refunds_payable"])
        cos_acc = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["cos"])
        inventory = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["inventory_allocated"])
        ref = _("Cancellation — %s") % self.name
        moves = []

        if net_rec and revenue and clearing:
            moves.append(
                self._lakecity_create_stand_move(
                    self._lakecity_build_move_lines(
                        [(revenue, net_rec, 0.0, False), (clearing, 0.0, net_rec, False)],
                        _("Reverse revenue — %s") % ref,
                    ),
                    ref,
                    "cancellation_revenue",
                )
            )

        if cos_rec and cos_acc and inventory:
            moves.append(
                self._lakecity_create_stand_move(
                    self._lakecity_build_move_lines(
                        [(inventory, cos_rec, 0.0, False), (cos_acc, 0.0, cos_rec, False)],
                        _("Reverse COS — %s") % ref,
                    ),
                    ref,
                    "cancellation_cos",
                )
            )

        fee_lines = []
        if admin_fee and clearing and admin:
            fee_lines.extend(
                self._lakecity_build_move_lines(
                    [(clearing, admin_fee, 0.0, False), (admin, 0.0, admin_fee, False)],
                    _("Admin fee — %s") % ref,
                )
            )
        if refund and clearing and refunds_pay:
            fee_lines.extend(
                self._lakecity_build_move_lines(
                    [(clearing, refund, 0.0, False), (refunds_pay, 0.0, refund, False)],
                    _("Refund payable — %s") % ref,
                )
            )
        if fee_lines:
            moves.append(self._lakecity_create_stand_move(fee_lines, ref, "cancellation_refund"))

        if moves:
            self.write({"lakecity_cancellation_move_ids": [(6, 0, [m.id for m in moves])]})
        self.write({"state": "closed"})

    def _lakecity_post_default_receivable_reclass(self):
        """Step 10 optional — reclass remaining AR to defaulted receivables account."""
        self.ensure_one()
        if not self._lakecity_company_stand_accounting_enabled():
            return False
        if self.lakecity_default_reclass_move_id:
            return self.lakecity_default_reclass_move_id

        gross_contract = self.total_with_tax or 0.0
        gross_paid = self.total_paid or 0.0
        remaining = float_round(gross_contract - gross_paid, precision_rounding=self.currency_id.rounding)
        if float_is_zero(remaining, precision_rounding=self.currency_id.rounding):
            return False

        ar = self._lakecity_partner_receivable_account()
        defaulted = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES["defaulted_receivable"])
        if not ar or not defaulted:
            return False

        partner_id = self.partner_id.commercial_partner_id.id
        ref = _("Default reclass — %s") % self.name
        lines = self._lakecity_build_move_lines(
            [(defaulted, remaining, 0.0, partner_id), (ar, 0.0, remaining, partner_id)],
            ref,
        )
        move = self._lakecity_create_stand_move(lines, ref, "default_reclass")
        self.write({"lakecity_default_reclass_move_id": move.id})
        return move

    def _lakecity_post_pass_through(self, amount, pass_type, move_date=None):
        """Steps 13–14 — AOS or conveyancing pass-through receipt (Dr bank / Cr payable)."""
        self.ensure_one()
        if not self._lakecity_company_stand_accounting_enabled():
            return False
        if float_is_zero(amount or 0.0, precision_rounding=self.currency_id.rounding):
            return False

        code_key = "aos_payable" if pass_type == "aos" else "conveyancing_payable"
        payable = self._lakecity_stand_account(LAKECITY_STAND_ACCOUNT_CODES[code_key])
        bank = self._lakecity_collections_bank_account()
        if not payable or not bank:
            raise UserError(_("Pass-through accounts or bank account are not configured."))

        purpose = "pass_through_aos" if pass_type == "aos" else "pass_through_conveyancing"
        ref = _("%(type)s pass-through — %(loan)s") % {
            "type": pass_type.upper(),
            "loan": self.name,
        }
        lines = self._lakecity_build_move_lines(
            [(bank, amount, 0.0, False), (payable, 0.0, amount, False)],
            ref,
        )
        journal = self.company_id.lakecity_bnpl_collections_journal_id
        if not journal:
            journal = self.env["account.journal"].sudo().search(
                [("company_id", "=", self.company_id.id), ("type", "in", ("bank", "cash"))],
                limit=1,
            )
        return self._lakecity_create_stand_move(lines, ref, purpose, journal=journal, move_date=move_date)


class ResCompany(models.Model):
    _inherit = "res.company"

    lakecity_stand_sales_accounting_enabled = fields.Boolean(
        string="Stand sales accounting (ZIMRA walkthrough)",
        default=True,
        help="Post initial contract, payment revenue/VAT/COS, forfeiture, and pass-through "
        "entries per the Lake City stand sale JE walkthrough. When enabled, the legacy "
        "BNPL GL mirror (Dr AR / Cr 251001 clearing) is disabled.",
    )
    lakecity_stand_sales_journal_id = fields.Many2one(
        "account.journal",
        string="Stand sales journal",
        check_company=True,
        domain="[('company_id', '=', id), ('type', '=', 'general')]",
        help="Miscellaneous journal for revenue/VAT/COS and contract recognition entries.",
    )
    lakecity_stand_inventory_reclass_enabled = fields.Boolean(
        string="Post inventory reclass on contract activation",
        default=True,
        help="Optional JE2: Dr Active Allocated Stands / Cr Residential Stands Available at stand cost.",
    )
    lakecity_cancellation_admin_fee_percent = fields.Float(
        string="Cancellation admin fee (%)",
        default=10.0,
        help="Admin fee retained on voluntary cancellation (walkthrough default 10%).",
    )

    def _lakecity_account_by_code(self, code):
        self.ensure_one()
        if not code:
            return self.env["account.account"]
        return (
            self.env["account.account"]
            .sudo()
            .with_company(self)
            .search(
                [
                    ("code", "=", str(code)),
                    ("active", "=", True),
                    *self.env["account.account"]._check_company_domain(self),
                ],
                limit=1,
            )
        )

    def _lakecity_stand_sales_journal(self):
        self.ensure_one()
        if self.lakecity_stand_sales_journal_id:
            return self.lakecity_stand_sales_journal_id
        return (
            self.env["account.journal"]
            .sudo()
            .search([("company_id", "=", self.id), ("code", "=", "STND")], limit=1)
        )

    def _lakecity_ensure_stand_sales_setup(self):
        """Bind STND journal, collections journal to CABS USD bank, disable legacy mirror."""
        Journal = self.env["account.journal"].sudo()
        for company in self:
            if company.lakecity_stand_sales_accounting_enabled:
                if not company.lakecity_stand_sales_journal_id:
                    j = Journal.search([("company_id", "=", company.id), ("code", "=", "STND")], limit=1)
                    if j:
                        company.lakecity_stand_sales_journal_id = j.id
                if not company.lakecity_bnpl_collections_journal_id:
                    bank_acc = company._lakecity_account_by_code(LAKECITY_STAND_ACCOUNT_CODES["bank_usd_main"])
                    if bank_acc:
                        bank_journal = Journal.search(
                            [
                                ("company_id", "=", company.id),
                                ("type", "in", ("bank", "cash")),
                                ("default_account_id", "=", bank_acc.id),
                            ],
                            limit=1,
                        )
                        if not bank_journal:
                            bank_journal = Journal.search(
                                [("company_id", "=", company.id), ("type", "=", "bank")],
                                limit=1,
                            )
                        if bank_journal:
                            company.lakecity_bnpl_collections_journal_id = bank_journal.id
                company.write(
                    {
                        "lakecity_bnpl_future_receivable_gl_enabled": False,
                        "lakecity_bnpl_post_bank_payment_per_receipt": False,
                    }
                )

    def _lakecity_account_balance(self, account):
        self.ensure_one()
        if not account:
            return 0.0
        lines = (
            self.env["account.move.line"]
            .sudo()
            .search([("account_id", "=", account.id), ("parent_state", "=", "posted")])
        )
        return sum(lines.mapped("credit")) - sum(lines.mapped("debit"))

    def action_lakecity_remittance_vat(self):
        """Step 06 — pay VAT Output balance to bank (manual amount from wizard context)."""
        self.ensure_one()
        vat_acc = self._lakecity_account_by_code(LAKECITY_STAND_ACCOUNT_CODES["vat_output"])
        if not vat_acc:
            raise UserError(_("VAT Output account (251010) not found."))
        amount = self.env.context.get("vat_remittance_amount")
        if amount is None:
            amount = self._lakecity_account_balance(vat_acc)
        amount = float(amount or 0.0)
        if float_is_zero(amount, precision_rounding=self.currency_id.rounding):
            raise UserError(_("No VAT Output balance to remit."))
        bank_acc = self._lakecity_account_by_code(LAKECITY_STAND_ACCOUNT_CODES["bank_usd_main"])
        journal = self.lakecity_bnpl_collections_journal_id or self.env["account.journal"].sudo().search(
            [("company_id", "=", self.id), ("type", "in", ("bank", "cash"))],
            limit=1,
        )
        if not vat_acc or not bank_acc or not journal:
            raise UserError(_("Configure VAT Output, bank account, and collections journal."))

        ref = _("VAT remittance")
        Move = self.env["account.move"].sudo()
        move = Move.create(
            {
                "move_type": "entry",
                "journal_id": journal.id,
                "company_id": self.id,
                "date": fields.Date.context_today(self),
                "ref": ref,
                "lakecity_stand_move_purpose": "vat_remittance",
                "line_ids": [
                    (
                        0,
                        0,
                        {
                            "account_id": vat_acc.id,
                            "name": ref,
                            "debit": amount,
                            "credit": 0.0,
                        },
                    ),
                    (
                        0,
                        0,
                        {
                            "account_id": bank_acc.id,
                            "name": ref,
                            "debit": 0.0,
                            "credit": amount,
                        },
                    ),
                ],
            }
        )
        move.action_post()
        return {
            "type": "ir.actions.act_window",
            "name": _("VAT remittance"),
            "res_model": "account.move",
            "view_mode": "form",
            "res_id": move.id,
        }
