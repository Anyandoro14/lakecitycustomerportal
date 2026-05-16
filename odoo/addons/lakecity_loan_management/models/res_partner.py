# -*- coding: utf-8 -*-
import logging

from odoo import _, api, fields, models

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = "res.partner"

    lakecity_loan_contract_ids = fields.One2many(
        "lakecity.loan.contract",
        "partner_id",
        string="Lakecity BNPL contracts",
    )
    lakecity_stand_list = fields.Char(
        string="Lakecity stands",
        compute="_compute_lakecity_stand_list",
        store=True,
        help="Comma-separated stands from BNPL contracts; links Accounting and CRM via loan contracts.",
    )

    @api.depends("lakecity_loan_contract_ids.stand_number")
    def _compute_lakecity_stand_list(self):
        for partner in self:
            stands = sorted(
                {
                    str(s or "").strip().upper()
                    for s in partner.lakecity_loan_contract_ids.mapped("stand_number")
                    if s
                }
            )
            partner.lakecity_stand_list = ", ".join(stands)

    # ------------------------------------------------------------------
    # Accounting (Contacts ↔ Accounting app)
    # ------------------------------------------------------------------
    # Dedicated trade receivable / payable ``account.account`` rows are **not**
    # provisioned from CRM or generic partner rank alone.
    #
    # Callers:
    # - ``lakecity.loan.contract`` save → receivable only (LakeCity BNPL path).
    # - Customer/vendor accounting moves → receivable / payable when invoices or
    #   bills exist (see ``account.move`` extension).

    def _lakecity_promote_customer_from_crm(self):
        """Mark Accounting customer when this partner appears on CRM pipeline."""
        for partner in self:
            if "customer_rank" not in partner._fields:
                continue
            if partner.customer_rank:
                continue
            partner.sudo().write({"customer_rank": 1})

    def _lakecity_ensure_dedicated_receivable_accounts(self):
        """Provision partner-specific AR for commercial entities (loan contract hook)."""
        if "account.account" not in self.env:
            return
        for partner in self.mapped("commercial_partner_id"):
            companies = partner.company_id or self.env.companies
            for company in companies:
                partner._lakecity_ensure_dedicated_receivable_for_company(company)

    def _lakecity_ensure_dedicated_receivable_for_company(self, company):
        self.ensure_one()
        partner = self.sudo().with_company(company)
        if partner.customer_rank <= 0:
            return
        template_ar = partner._lakecity_template_trade_account(company, "asset_receivable")
        vals = {}
        cur_ar = partner.property_account_receivable_id
        if template_ar and (not cur_ar or cur_ar == template_ar):
            dedicated_ar = partner._lakecity_create_dedicated_trade_account(
                company, template_ar, "asset_receivable"
            )
            if dedicated_ar:
                vals["property_account_receivable_id"] = dedicated_ar.id
        elif not template_ar:
            _logger.warning(
                "Lakecity: no asset_receivable account for company %s; "
                "cannot set receivable on %s",
                company.display_name,
                partner.display_name,
            )
        if vals:
            partner.write(vals)

    def _lakecity_ensure_dedicated_payable_for_company(self, company):
        self.ensure_one()
        partner = self.sudo().with_company(company)
        if partner.supplier_rank <= 0:
            return
        template_ap = partner._lakecity_template_trade_account(company, "liability_payable")
        vals = {}
        cur_ap = partner.property_account_payable_id
        if template_ap and (not cur_ap or cur_ap == template_ap):
            dedicated_ap = partner._lakecity_create_dedicated_trade_account(
                company, template_ap, "liability_payable"
            )
            if dedicated_ap:
                vals["property_account_payable_id"] = dedicated_ap.id
        elif not template_ap:
            _logger.warning(
                "Lakecity: no liability_payable account for company %s; "
                "cannot set payable on %s",
                company.display_name,
                partner.display_name,
            )
        if vals:
            partner.write(vals)

    def _lakecity_template_trade_account(self, company, account_type):
        """Primary chart AR/AP account used as code baseline (shared template)."""
        Account = self.env["account.account"]
        domain = [
            ("account_type", "=", account_type),
            ("deprecated", "=", False),
            *Account._check_company_domain(company),
        ]
        return (
            Account.with_company(company)
            .sudo()
            .search(domain, limit=1, order="code, id")
        )

    def _lakecity_create_dedicated_trade_account(self, company, template_acc, account_type):
        """One receivable/payable GL row per commercial partner (customer/vendor)."""
        self.ensure_one()
        Account = self.env["account.account"].sudo().with_company(company)
        partner = self.sudo().with_company(company)
        start_code = template_acc.with_company(company).code or (
            "121" if account_type == "asset_receivable" else "211"
        )
        new_code = Account._search_new_account_code(start_code, cache={start_code})
        label = (
            _("Trade Receivable — %s") % partner.display_name
            if account_type == "asset_receivable"
            else _("Trade Payable — %s") % partner.display_name
        )
        return Account.create(
            {
                "code": new_code,
                "name": label[:200],
                "account_type": account_type,
                "company_ids": [(6, 0, company.ids)],
                "non_trade": template_acc.non_trade,
            }
        )
