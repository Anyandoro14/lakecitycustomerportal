# -*- coding: utf-8 -*-
from odoo import _, fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    lakecity_bnpl_future_receivable_gl_enabled = fields.Boolean(
        string="Lakecity BNPL: mirror outstanding loans on GL",
        default=True,
        help="When enabled, each active loan keeps one posted journal entry: Debit the "
        "customer receivable for the outstanding balance, Credit a BNPL clearing "
        "(current liability) account — so unpaid installments appear on the GL as "
        "trade receivables with an offsetting clearing line. "
        "Leave off when using “Post bank payment per BNPL receipt” (recommended) "
        "so receivable is tracked only from real receipts.",
    )
    lakecity_bnpl_post_bank_payment_per_receipt = fields.Boolean(
        string="Post bank payment per BNPL receipt",
        default=False,
        help="For each posted Lakecity BNPL receipt, create and confirm a standard "
        "customer payment on the collections journal (bank or cash liquidity → partner "
        "receivable). Installment allocation stays on the BNPL loan; Accounting gets "
        "one journal entry per receipt. While this is on, GL mirror moves above are skipped.",
    )
    lakecity_bnpl_collections_journal_id = fields.Many2one(
        "account.journal",
        string="BNPL collections journal",
        check_company=True,
        domain="[('company_id', '=', id), ('type', 'in', ('bank', 'cash'))]",
        help="Bank or cash journal used for inbound customer payments created from BNPL receipts. "
        "Must have at least one inbound payment method configured.",
    )
    lakecity_bnpl_journal_id = fields.Many2one(
        "account.journal",
        string="Lakecity BNPL journal",
        check_company=True,
        domain="[('company_id', '=', id), ('type', '=', 'general')]",
        help="Miscellaneous journal used for BNPL future-receivable mirror entries.",
    )
    lakecity_bnpl_installment_clearing_account_id = fields.Many2one(
        "account.account",
        string="BNPL installment clearing account",
        check_company=True,
        domain="[('active', '=', True), ('account_type', '=', 'liability_current')]",
        help="Credit side of the mirror entry (control / deferred-installment obligation). "
        "Configure explicitly or leave empty to auto-create next to your chart.",
    )

    def _lakecity_bnpl_ensure_journal(self):
        """BNPL-dedicated general journal (one per company)."""
        self.ensure_one()
        company = self.sudo()
        if company.lakecity_bnpl_journal_id:
            return company.lakecity_bnpl_journal_id
        Journal = self.env["account.journal"].sudo().with_company(company)
        journal = Journal.search(
            [("company_id", "=", company.id), ("code", "=", "BNPL")],
            limit=1,
        )
        if not journal:
            journal = Journal.create(
                {
                    "name": _("Lakecity BNPL"),
                    "code": "BNPL",
                    "type": "general",
                    "company_id": company.id,
                }
            )
        company.write({"lakecity_bnpl_journal_id": journal.id})
        return journal

    def _lakecity_bnpl_ensure_clearing_account(self):
        """Current-liability clearing row used as the credit side of BNPL mirror entries."""
        self.ensure_one()
        company = self.sudo()
        if company.lakecity_bnpl_installment_clearing_account_id:
            return company.lakecity_bnpl_installment_clearing_account_id
        Account = self.env["account.account"].sudo().with_company(company)
        template = Account.search(
            [
                ("account_type", "=", "liability_current"),
                ("active", "=", True),
                *Account._check_company_domain(company),
            ],
            limit=1,
            order="code desc, id desc",
        )
        start_code = template.code if template else "229"
        new_code = Account._search_new_account_code(start_code, cache={start_code})
        acc = Account.create(
            {
                "code": new_code,
                "name": _("Lakecity BNPL — Future installments (clearing)")[:200],
                "account_type": "liability_current",
                "company_ids": [(6, 0, company.ids)],
            }
        )
        company.write({"lakecity_bnpl_installment_clearing_account_id": acc.id})
        return acc
