# -*- coding: utf-8 -*-
from odoo import _, fields, models
from odoo.exceptions import UserError


class AccountPaymentRegister(models.TransientModel):
    _inherit = "account.payment.register"

    lakecity_payment_receipt = fields.Binary(string="Payment receipt")
    lakecity_payment_receipt_filename = fields.Char(string="Receipt filename")

    def action_create_payments(self):
        self._lakecity_validate_customer_payment_receipt()
        return super().action_create_payments()

    def _lakecity_validate_customer_payment_receipt(self):
        for wiz in self:
            if wiz.partner_type == "customer" and wiz.payment_type == "inbound":
                if not wiz.lakecity_payment_receipt:
                    raise UserError(_("Uploading a payment receipt is required."))

    def _create_payments(self):
        payments = super()._create_payments()
        self._lakecity_attach_payment_receipts_to_payments(payments)
        return payments

    def _lakecity_attach_payment_receipts_to_payments(self, payments):
        self.ensure_one()
        if (
            not self.lakecity_payment_receipt
            or self.partner_type != "customer"
            or self.payment_type != "inbound"
        ):
            return
        Attachment = self.env["ir.attachment"].sudo()
        name = self.lakecity_payment_receipt_filename or _("payment-receipt")
        base_payload = {
            "type": "binary",
            "datas": self.lakecity_payment_receipt,
            "mimetype": "application/octet-stream",
        }
        for payment in payments:
            Attachment.create(
                dict(
                    base_payload,
                    name=name,
                    res_model="account.payment",
                    res_id=payment.id,
                )
            )
