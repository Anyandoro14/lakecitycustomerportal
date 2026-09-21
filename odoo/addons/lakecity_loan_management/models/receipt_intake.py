# -*- coding: utf-8 -*-
import base64
import logging
import urllib.error
import urllib.parse
import urllib.request

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class LakecityReceiptIntake(models.Model):
    """Receipt submissions from Google Forms / Apps Script — QC in Odoo before BNPL posting."""

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
    contract_warning = fields.Char(
        string="Contract check",
        readonly=True,
        help="Filled on create when no active loan contract matches this stand.",
    )

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

    _lakecity_receipt_intake_uuid_uniq = models.Constraint(
        "unique(intake_uuid)",
        "This intake UUID was already submitted.",
    )

    @api.depends("intake_uuid", "stand_number")
    def _compute_name(self):
        for rec in self:
            rec.name = "%s — Stand %s" % (rec.intake_uuid or _("Draft"), rec.stand_number or "?")

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if rec.state == "pending_qc":
                rec._lakecity_apply_contract_warning()
                rec._lakecity_notify_new_intake(is_failure=False)
        return records

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
            pay_date = rec.payment_date or fields.Date.context_today(rec)
            if contract._lakecity_is_pre_accounting_start(pay_date):
                start = contract._lakecity_accounting_start_date()
                raise UserError(
                    _(
                        "Receipt date %(date)s is before the accounting start date %(start)s. "
                        "Pre-start receipts stay on the customer portal and are included in the "
                        "opening-balance journal entry. Do not post them as individual Odoo receipts. "
                        "Use Lakecity Loans → Accounting start cutover."
                    )
                    % {
                        "date": pay_date,
                        "start": start,
                    }
                )
            pay_vals = {
                "external_uid": rec.intake_uuid,
                "contract_id": contract.id,
                "payment_date": pay_date,
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
            else:
                rec._lakecity_schedule_attachment_retry_activity(fname)

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

    def _lakecity_apply_contract_warning(self):
        """Soft check: stand has a loan contract (QC still required to approve)."""
        self.ensure_one()
        Contract = self.env["lakecity.loan.contract"].sudo()
        stand = Contract._lakecity_normalize_stand(self.stand_number)
        contract = Contract.search([("stand_number", "=", stand)], limit=1)
        if contract:
            self.sudo().write({"contract_warning": False, "contract_id": contract.id})
            return True
        msg = _("No loan contract found for stand %s — create/activate the contract before QC approve.") % stand
        self.sudo().write({"contract_warning": msg})
        self.message_post(body=msg, subtype_xmlid="mail.mt_note")
        return False

    def _lakecity_schedule_attachment_retry_activity(self, fname_hint):
        self.ensure_one()
        try:
            self.activity_schedule(
                "mail.mail_activity_data_todo",
                summary=_("Receipt attachment download failed"),
                note=_(
                    "Could not download receipt for intake %(uuid)s from %(url)s "
                    "(filename hint: %(fname)s). Re-upload or attach manually on the BNPL payment."
                )
                % {
                    "uuid": self.intake_uuid,
                    "url": self.receipt_url or "—",
                    "fname": fname_hint or "—",
                },
            )
        except Exception as err:
            _logger.warning("Lakecity intake %s: could not schedule attachment activity: %s", self.intake_uuid, err)

    def _lakecity_notify_param(self, key, default=""):
        return (self.env["ir.config_parameter"].sudo().get_param(key, default=default) or "").strip()

    def _lakecity_notify_new_intake(self, is_failure=False, error_text=None):
        """Chatter + optional email/SMS so ops alerts are not solely on Apps Script."""
        self.ensure_one()
        subject = (
            _("LakeCity receipt intake FAILED — stand %s") % (self.stand_number or "?")
            if is_failure
            else _("LakeCity receipt intake — stand %s") % (self.stand_number or "?")
        )
        body_lines = [
            _("Stand: %s") % (self.stand_number or "—"),
            _("Amount: %s") % (self.payment_amount or "—"),
            _("Customer: %s") % (self.customer_name or "—"),
            _("UUID: %s") % (self.intake_uuid or "—"),
            _("Receipt URL: %s") % (self.receipt_url or "—"),
            _("Entered by: %s") % (self.entered_by or "—"),
            _("Payment method: %s") % (self.payment_method_raw or "—"),
            _("Receipt date: %s") % (self.payment_date or "—"),
        ]
        if self.contract_warning:
            body_lines.append(_("Warning: %s") % self.contract_warning)
        if error_text:
            body_lines.append(_("Error: %s") % error_text)
        body_lines.append(_("Next: Lakecity Loans → Receipt intakes (QC)"))
        body_text = "\n".join(body_lines)

        self.message_post(
            body="<br/>".join(body_lines),
            subject=subject,
            subtype_xmlid="mail.mt_comment",
        )

        emails = self._lakecity_notify_param("lakecity_loan.notify_emails")
        if emails:
            self._lakecity_send_notify_email(emails, subject, body_text)

        sms_to = self._lakecity_notify_param("lakecity_loan.notify_sms_to")
        if sms_to:
            sms_body = (
                _("LakeCity receipt FAIL stand %s") % (self.stand_number or "?")
                if is_failure
                else _("LakeCity receipt OK stand %(stand)s amt %(amt)s")
                % {"stand": self.stand_number or "?", "amt": self.payment_amount or "?"}
            )
            self._lakecity_send_notify_sms(sms_to, sms_body)

    def _lakecity_send_notify_email(self, emails_csv, subject, body_text):
        self.ensure_one()
        Mail = self.env["mail.mail"].sudo()
        for addr in [a.strip() for a in emails_csv.split(",") if a.strip()]:
            try:
                mail = Mail.create(
                    {
                        "subject": subject,
                        "body_html": "<pre>%s</pre>" % (body_text.replace("<", "&lt;").replace(">", "&gt;")),
                        "email_to": addr,
                        "auto_delete": True,
                    }
                )
                mail.send()
            except Exception as err:
                _logger.warning("Lakecity intake %s: notify email to %s failed: %s", self.intake_uuid, addr, err)

    def _lakecity_send_notify_sms(self, to_csv, body):
        """Optional Twilio SMS via system parameters (same secrets pattern as Apps Script)."""
        self.ensure_one()
        sid = self._lakecity_notify_param("lakecity_loan.twilio_account_sid")
        token = self._lakecity_notify_param("lakecity_loan.twilio_auth_token")
        from_num = self._lakecity_notify_param("lakecity_loan.twilio_from")
        if not (sid and token and from_num):
            _logger.info("Lakecity intake %s: Twilio params incomplete; skipping SMS", self.intake_uuid)
            return

        endpoint = "https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json" % urllib.parse.quote(sid)
        auth = base64.b64encode(("%s:%s" % (sid, token)).encode()).decode()
        for to in [t.strip() for t in to_csv.split(",") if t.strip()]:
            data = urllib.parse.urlencode({"To": to, "From": from_num, "Body": body}).encode()
            req = urllib.request.Request(
                endpoint,
                data=data,
                headers={
                    "Authorization": "Basic %s" % auth,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Lakecity-Odoo-ReceiptIntake/1.0",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    raw = resp.read()
                _logger.info("Lakecity intake %s: Twilio SMS to %s ok (%s)", self.intake_uuid, to, raw[:120])
            except Exception as err:
                _logger.warning("Lakecity intake %s: Twilio SMS to %s failed: %s", self.intake_uuid, to, err)
