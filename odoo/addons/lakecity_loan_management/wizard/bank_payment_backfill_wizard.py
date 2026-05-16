# -*- coding: utf-8 -*-
from odoo import _, fields, models
from odoo.exceptions import UserError


class LakecityBankPaymentBackfillWizard(models.TransientModel):
    _name = "lakecity.bank.payment.backfill.wizard"
    _description = "Backfill customer payments from BNPL receipts"

    company_id = fields.Many2one(
        "res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
    result_message = fields.Text(string="Result", readonly=True)

    def _eligible_payments_domain(self):
        self.ensure_one()
        return [
            ("state", "=", "posted"),
            ("account_payment_id", "=", False),
            ("contract_id.company_id", "=", self.company_id.id),
        ]

    def _require_company_toggle(self):
        self.ensure_one()
        if not self.company_id.lakecity_bnpl_post_bank_payment_per_receipt:
            raise UserError(
                _(
                    "Turn on ‘Post bank payment per BNPL receipt’ and configure the BNPL "
                    "collections journal on %(company)s first.",
                    company=self.company_id.display_name,
                )
            )

    def action_preview(self):
        self.ensure_one()
        self._require_company_toggle()
        Pay = self.env["lakecity.loan.payment"].sudo()
        nb = Pay.search_count(self._eligible_payments_domain())
        self.result_message = _(
            "%(nb)d posted BNPL receipt(s) without an accounting payment for %(company)s."
        ) % {"nb": nb, "company": self.company_id.display_name}
        return self._reopen_self()

    def action_apply(self):
        self.ensure_one()
        self._require_company_toggle()
        if "account.payment" not in self.env:
            raise UserError(_("Accounting is not installed on this database."))

        Pay = self.env["lakecity.loan.payment"].sudo()
        candidates = Pay.search(self._eligible_payments_domain(), order="payment_date,id")
        ok = 0
        errors = []
        for pay in candidates:
            try:
                pay._lakecity_create_bank_payment()
                ok += 1
            except Exception as err:
                errors.append("%s (stand %s): %s" % (pay.name, pay.stand_number or "—", err))

        self.result_message = _(
            "Created %(ok)d accounting payment(s). Candidates: %(total)d."
        ) % {"ok": ok, "total": len(candidates)}
        if errors:
            self.result_message += "\n\n" + _("Errors (%(n)d):") % {"n": len(errors)}
            self.result_message += "\n" + "\n".join(errors[:50])
            if len(errors) > 50:
                self.result_message += "\n…"
        return self._reopen_self()

    def _reopen_self(self):
        return {
            "type": "ir.actions.act_window",
            "name": _("Backfill bank payments"),
            "res_model": "lakecity.bank.payment.backfill.wizard",
            "view_mode": "form",
            "target": "new",
            "res_id": self.id,
        }
