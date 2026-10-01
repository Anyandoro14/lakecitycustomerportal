# -*- coding: utf-8 -*-
from odoo import _, fields, models
from odoo.exceptions import UserError


class LakecityVatRevenueCorrectionWizard(models.TransientModel):
    _name = "lakecity.vat.revenue.correction.wizard"
    _description = "Correct overstated revenue (VAT split) on prior BNPL receipts"

    company_id = fields.Many2one(
        "res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
    dry_run = fields.Boolean(
        string="Dry run (preview only)",
        default=True,
        help="When checked, diagnose overstated receipts but do not post adjusting entries. "
        "Staging-first: preview on Staging, then uncheck and apply.",
    )
    result_message = fields.Text(string="Result", readonly=True)

    def _require_stand_sales(self):
        self.ensure_one()
        if not self.company_id.lakecity_stand_sales_accounting_enabled:
            raise UserError(
                _(
                    "Turn on stand sales accounting on %(company)s first.",
                    company=self.company_id.display_name,
                )
            )

    def action_preview(self):
        self.ensure_one()
        self._require_stand_sales()
        Contract = self.env["lakecity.loan.contract"].sudo()
        payments = Contract._lakecity_iter_overstated_revenue_payments(company=self.company_id)
        lines = []
        total_vat = 0.0
        for pay in payments:
            diag = pay.contract_id._lakecity_payment_overstated_revenue_diagnosis(pay)
            if not diag:
                continue
            total_vat += diag["vat"]
            lines.append(
                "Stand %(stand)s · %(pay)s · %(kind)s · gross %(gross).2f → "
                "net %(net).2f / VAT %(vat).2f"
                % {
                    "stand": pay.stand_number or "—",
                    "pay": pay.name,
                    "kind": diag["kind"],
                    "gross": diag["gross"],
                    "net": diag["net"],
                    "vat": diag["vat"],
                }
            )
        self.result_message = _(
            "Found %(n)d overstated-revenue receipt(s) for %(company)s. "
            "Total VAT to reclassify: %(vat).2f.\n\n%(detail)s"
        ) % {
            "n": len(lines),
            "company": self.company_id.display_name,
            "vat": total_vat,
            "detail": "\n".join(lines[:80]) if lines else _("(none)"),
        }
        if len(lines) > 80:
            self.result_message += "\n…"
        return self._reopen_self()

    def action_apply(self):
        self.ensure_one()
        self._require_stand_sales()
        Contract = self.env["lakecity.loan.contract"].sudo()
        payments = Contract._lakecity_iter_overstated_revenue_payments(company=self.company_id)
        ok = 0
        skipped = 0
        errors = []
        details = []
        dry = bool(self.dry_run)
        for pay in payments:
            try:
                row = pay.contract_id._lakecity_correct_overstated_revenue_payment(pay, dry_run=dry)
                if row.get("skipped"):
                    skipped += 1
                    continue
                ok += 1
                details.append(
                    "%(stand)s · %(pay)s · %(kind)s · VAT %(vat).2f%(move)s"
                    % {
                        "stand": row.get("stand_number") or "—",
                        "pay": row.get("payment_name") or pay.name,
                        "kind": row.get("kind"),
                        "vat": row.get("vat") or 0.0,
                        "move": (" · move %s" % row["move_id"]) if row.get("move_id") else " · dry-run",
                    }
                )
            except Exception as err:  # noqa: BLE001
                errors.append("%s (stand %s): %s" % (pay.name, pay.stand_number or "—", err))

        verb = _("Would correct") if dry else _("Corrected")
        self.result_message = _(
            "%(verb)s %(ok)d receipt(s). Skipped %(skipped)d. Candidates: %(total)d. Dry run: %(dry)s."
        ) % {
            "verb": verb,
            "ok": ok,
            "skipped": skipped,
            "total": len(payments),
            "dry": dry,
        }
        if details:
            self.result_message += "\n\n" + "\n".join(details[:50])
            if len(details) > 50:
                self.result_message += "\n…"
        if errors:
            self.result_message += "\n\n" + _("Errors (%(n)d):") % {"n": len(errors)}
            self.result_message += "\n" + "\n".join(errors[:50])
        return self._reopen_self()

    def _reopen_self(self):
        return {
            "type": "ir.actions.act_window",
            "name": _("Correct overstated revenue (VAT)"),
            "res_model": "lakecity.vat.revenue.correction.wizard",
            "view_mode": "form",
            "target": "new",
            "res_id": self.id,
        }
