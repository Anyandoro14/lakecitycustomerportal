# -*- coding: utf-8 -*-
from odoo import api, models


class AccountPaymentMethod(models.Model):
    _inherit = "account.payment.method"

    @api.model
    def _get_payment_method_information(self):
        res = super()._get_payment_method_information()
        # Like `manual`: one line per bank/cash journal; different labels for audit.
        multi = {"mode": "multi", "type": ("bank", "cash", "credit")}
        res.update(
            {
                "lakecity_transfer": multi,
                "lakecity_cash": multi,
                "lakecity_ecocash": multi,
                "lakecity_kuva": multi,
                "lakecity_transfer_out": multi,
                "lakecity_cash_out": multi,
                "lakecity_ecocash_out": multi,
                "lakecity_kuva_out": multi,
            }
        )
        return res
