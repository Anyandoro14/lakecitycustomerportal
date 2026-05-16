# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class LakecityLoanPayment(models.Model):
    _name = "lakecity.loan.payment"
    _description = "Lakecity Loan Payment"
    _order = "payment_date desc, id desc"

    company_id = fields.Many2one(
        related="contract_id.company_id",
        store=True,
        readonly=True,
        index=True,
    )
    name = fields.Char(default="New", readonly=True, copy=False)
    external_uid = fields.Char(copy=False, index=True)
    contract_id = fields.Many2one("lakecity.loan.contract", required=True, ondelete="cascade")
    partner_id = fields.Many2one(
        related="contract_id.partner_id", string="Customer", store=True, readonly=True
    )
    stand_number = fields.Char(related="contract_id.stand_number", store=True, readonly=True)
    payment_date = fields.Date(required=True, default=fields.Date.context_today)
    amount = fields.Monetary(required=True)
    currency_id = fields.Many2one(related="contract_id.currency_id", store=True, readonly=True)
    source = fields.Selection(
        [
            ("manual", "Manual"),
            ("kuva", "KUVA"),
            ("paystack", "Paystack"),
            ("paypal", "PayPal"),
            ("flutterwave", "Flutterwave"),
            ("odoo", "Odoo"),
            ("mobile_money", "Mobile Money"),
            ("bank_transfer", "Bank Transfer"),
            ("cash", "Cash"),
            ("ecocash", "EcoCash"),
            ("card", "Card"),
        ],
        default="manual",
        required=True,
    )
    reference = fields.Char()
    note = fields.Text()
    state = fields.Selection(
        [("draft", "Draft"), ("posted", "Posted"), ("cancelled", "Cancelled")],
        default="posted",
        required=True,
    )
    account_payment_id = fields.Many2one(
        "account.payment",
        string="Bank/cash payment",
        readonly=True,
        copy=False,
        check_company=True,
    )

    _lakecity_loan_payment_external_uid_unique = models.Constraint(
        "unique(external_uid)",
        "External payment UID must be unique.",
    )

    @api.model_create_multi
    def create(self, vals_list):
        seq = self.env["ir.sequence"]
        for vals in vals_list:
            if vals.get("name", "New") == "New":
                vals["name"] = seq.next_by_code("lakecity.loan.payment") or "New"
        payments = super().create(vals_list)
        payments._apply_to_schedules()
        payments.filtered(lambda p: p.state == "posted")._lakecity_ensure_bank_payment()
        return payments

    def write(self, vals):
        if not self.env.context.get("lakecity_skip_bank_payment_write"):
            if vals.get("state") == "cancelled":
                self._lakecity_cancel_bank_payment()
            locked = ("amount", "payment_date", "contract_id")
            for rec in self:
                ap = rec.account_payment_id
                if ap and ap.state in ("paid", "in_process"):
                    if any(k in vals for k in locked):
                        raise UserError(
                            _(
                                "This BNPL receipt is already linked to accounting payment %(ap)s. "
                                "Cancel that payment in Accounting first, or adjust only draft BNPL lines.",
                                ap=ap.display_name,
                            )
                        )
        result = super().write(vals)
        if "state" in vals or "amount" in vals or "contract_id" in vals or "payment_date" in vals:
            self.mapped("contract_id")._rebuild_payment_allocations()
        if vals.get("state") == "posted":
            self._lakecity_ensure_bank_payment()
        return result

    def _apply_to_schedules(self):
        self.mapped("contract_id")._rebuild_payment_allocations()

    def _lakecity_ensure_bank_payment(self):
        for rec in self:
            company = rec.contract_id.company_id.sudo()
            if not company.lakecity_bnpl_post_bank_payment_per_receipt:
                continue
            if rec.state != "posted":
                continue
            if rec.account_payment_id:
                continue
            if "account.payment" not in rec.env:
                continue
            rec._lakecity_create_bank_payment()

    def _lakecity_create_bank_payment(self):
        """One posted customer payment: liquidity (bank/cash) vs partner receivable."""
        self.ensure_one()
        if self.account_payment_id:
            return
        company = self.contract_id.company_id.sudo()
        journal = company.lakecity_bnpl_collections_journal_id
        if not journal:
            journal = self.env["account.journal"].sudo().search(
                [("company_id", "=", company.id), ("type", "=", "bank")],
                limit=1,
            )
        if not journal:
            journal = self.env["account.journal"].sudo().search(
                [("company_id", "=", company.id), ("type", "=", "cash")],
                limit=1,
            )
        if not journal:
            raise UserError(
                _(
                    "Configure “BNPL collections journal” on the company (%(company)s), "
                    "or create a bank/cash journal.",
                    company=company.display_name,
                )
            )
        pm_line = journal.inbound_payment_method_line_ids[:1]
        if not pm_line:
            raise UserError(
                _(
                    "Journal %(journal)s has no inbound payment method line. "
                    "Open the journal and add an inbound payment method (e.g. Manual).",
                    journal=journal.display_name,
                )
            )
        partner = self.contract_id.partner_id.commercial_partner_id
        memo = _("BNPL %(loan)s · %(pay)s%(ref)s") % {
            "loan": self.contract_id.display_name,
            "pay": self.name,
            "ref": (" · %s" % self.reference) if self.reference else "",
        }
        Pay = self.env["account.payment"].sudo().with_company(company)
        payment = Pay.with_context(force_payment_move=True).create(
            {
                "payment_type": "inbound",
                "partner_type": "customer",
                "partner_id": partner.id,
                "amount": self.amount,
                "date": self.payment_date,
                "journal_id": journal.id,
                "payment_method_line_id": pm_line.id,
                "memo": memo,
                "payment_reference": self.reference or self.external_uid or self.name,
                "currency_id": self.currency_id.id,
                "lakecity_loan_payment_id": self.id,
            }
        )
        payment.action_post()
        if payment.state == "in_process":
            payment.action_validate()
        if not payment.move_id:
            raise UserError(
                _("Accounting payment %(pay)s was confirmed but has no journal entry.") % {"pay": payment.display_name}
            )
        if "lakecity_loan_contract_id" in payment.move_id._fields:
            payment.move_id.write({"lakecity_loan_contract_id": self.contract_id.id})
        Attachment = self.env["ir.attachment"].sudo()
        for att in Attachment.search(
            [("res_model", "=", "lakecity.loan.payment"), ("res_id", "=", self.id)]
        ):
            att.copy(
                {
                    "res_model": "account.payment",
                    "res_id": payment.id,
                }
            )
        self.with_context(lakecity_skip_bank_payment_write=True).write({"account_payment_id": payment.id})

    def action_open_account_payment(self):
        self.ensure_one()
        if not self.account_payment_id:
            return False
        return {
            "type": "ir.actions.act_window",
            "name": _("Accounting payment"),
            "res_model": "account.payment",
            "view_mode": "form",
            "res_id": self.account_payment_id.id,
        }

    def _lakecity_cancel_bank_payment(self):
        for rec in self:
            ap = rec.account_payment_id.sudo()
            if not ap:
                continue
            if ap.state == "draft":
                ap.unlink()
            elif ap.state != "canceled":
                ap.action_cancel()
        with_cancel = self.filtered("account_payment_id")
        if with_cancel:
            with_cancel.with_context(lakecity_skip_bank_payment_write=True).write({"account_payment_id": False})
