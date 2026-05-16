# -*- coding: utf-8 -*-
import base64
import logging
import urllib.error
import urllib.request

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class LakecityReceiptIntake(models.Model):
    """Receipt submissions from Make.com / forms — QC in Odoo before BNPL posting."""

    _name = "lakecity.receipt.intake"
    _description = "Lakecity Receipt Intake"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "create_date desc"

    name = fields.Char(compute="_compute_name", store=True)
    intake_uuid = fields.Char(string="Intake ID", required=True, index=True, copy=False)
    timestamp_received = fields.Datetime(string="Submitted at")
    stand_number = fields.Char(required=True, index=True)
    customer_name = fields.Char()
    payment_date = fields.Date(string="Receipt date")
    payment_amount = fields.Monetary(string="Amount", required=True, currency_field="currency_id")
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
        required=True,
    )
    payment_method_raw = fields.Char(string="Payment method (form)")
    reference = fields.Char()
    receipt_url = fields.Char(string="Receipt URL", required=True)
    entered_by = fields.Char(string="Entered by")

    state = fields.Selection(
        [
            ("pending_qc", "Pending QC"),
            ("posted", "Posted to BNPL"),
            ("rejected", "Rejected"),
        ],
        default="pending_qc",
        required=True,
        tracking=True,
    )
    qc_notes = fields.Text(string="QC notes")
    rejection_reason = fields.Text(string="Rejection reason")

    contract_id = fields.Many2one("lakecity.loan.contract", string="Loan contract", readonly=True)
    loan_payment_id = fields.Many2one("lakecity.loan.payment", string="BNPL payment", readonly=True)

    _sql_constraints = [
        ("lakecity_receipt_intake_uuid_uniq", "unique(intake_uuid)", "This intake UUID was already submitted."),
    ]

    @api.depends("intake_uuid", "stand_number")
    def _compute_name(self):
        for rec in self:
            rec.name = "%s — Stand %s" % (rec.intake_uuid or _("Draft"), rec.stand_number or "?")

    @api.model
    def map_payment_source_from_label(self, label):
        """Align Google Form labels with lakecity.loan.payment.source."""
        key = (label or "").strip().lower()
        if not key:
            return "manual"
        if "kuva" in key:
            return "kuva"
        if "eco" in key:
            return "ecocash"
        if "cash" in key:
            return "cash"
        if "transfer" in key or "bank" in key:
            return "bank_transfer"
        return "manual"

    def action_open_payment(self):
        self.ensure_one()
        if not self.loan_payment_id:
            return False
        return {
            "type": "ir.actions.act_window",
            "name": _("BNPL Payment"),
            "res_model": "lakecity.loan.payment",
            "view_mode": "form",
            "res_id": self.loan_payment_id.id,
        }

    def action_qc_post_to_bnpl(self):
        Contract = self.env["lakecity.loan.contract"].sudo()
        Payment = self.env["lakecity.loan.payment"].sudo()
        Attachment = self.env["ir.attachment"].sudo()

        for rec in self:
            if rec.state != "pending_qc":
                raise UserError(_("Only pending intakes can be approved."))
            stand = Contract._lakecity_normalize_stand(rec.stand_number)
            contract = Contract.search([("stand_number", "=", stand)], limit=1)
            if not contract:
                raise UserError(
                    _("No Lakecity loan contract found for stand %s. Create the contract first.") % stand
                )

            src = rec.map_payment_source_from_label(rec.payment_method_raw)
            pay_vals = {
                "external_uid": rec.intake_uuid,
                "contract_id": contract.id,
                "payment_date": rec.payment_date or fields.Date.context_today(rec),
                "amount": rec.payment_amount,
                "source": src,
                "reference": rec.reference or rec.intake_uuid,
                "note": rec._format_payment_note(),
                "state": "posted",
            }
            existing = Payment.search([("external_uid", "=", rec.intake_uuid)], limit=1)
            if existing:
                existing.write(pay_vals)
                payment = existing
            else:
                payment = Payment.create(pay_vals)

            contract._rebuild_payment_allocations()

            fname, b64 = rec._download_receipt_as_attachment()
            if b64:
                Attachment.create(
                    {
                        "name": fname,
                        "type": "binary",
                        "datas": b64,
                        "res_model": "lakecity.loan.payment",
                        "res_id": payment.id,
                        "mimetype": "application/octet-stream",
                    }
                )

            rec.write(
                {
                    "state": "posted",
                    "contract_id": contract.id,
                    "loan_payment_id": payment.id,
                }
            )

        return True

    def action_qc_reject(self):
        for rec in self:
            if rec.state != "pending_qc":
                raise UserError(_("Only pending intakes can be rejected."))
            if not (rec.rejection_reason or "").strip():
                raise UserError(_("Enter a rejection reason before rejecting."))
            rec.state = "rejected"
        return True

    def _format_payment_note(self):
        self.ensure_one()
        lines = [
            _("Receipt intake %(uuid)s") % {"uuid": self.intake_uuid},
            _("Customer: %s") % (self.customer_name or "—"),
            _("Entered by: %s") % (self.entered_by or "—"),
            _("Original method: %s") % (self.payment_method_raw or "—"),
            _("Receipt URL: %s") % (self.receipt_url or "—"),
        ]
        if self.qc_notes:
            lines.append(_("QC: %s") % self.qc_notes)
        return "\n".join(lines)

    def _download_receipt_as_attachment(self):
        """Return (filename, base64_datas) or (fname_hint, False)."""
        self.ensure_one()
        url = (self.receipt_url or "").strip()
        if not url.startswith("https://"):
            _logger.warning("Lakecity intake %s: receipt URL not https; skipping download", self.intake_uuid)
            return _("receipt.bin"), False
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Lakecity-Odoo-ReceiptIntake/1.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read()
            fname = url.rstrip("/").split("/")[-1].split("?")[0] or "receipt"
            if len(fname) > 120:
                fname = fname[:120]
            return fname, base64.b64encode(raw).decode()
        except (urllib.error.URLError, OSError, ValueError) as err:
            _logger.warning("Lakecity intake %s: could not download receipt: %s", self.intake_uuid, err)
            return _("receipt.bin"), False
