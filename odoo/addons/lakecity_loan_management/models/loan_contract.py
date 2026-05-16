# -*- coding: utf-8 -*-
from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class LakecityLoanContract(models.Model):
    _name = "lakecity.loan.contract"
    _description = "Lakecity Loan Contract"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "create_date desc"

    name = fields.Char(default="New", readonly=True, copy=False, tracking=True)
    external_uid = fields.Char(copy=False, tracking=True, index=True)
    partner_id = fields.Many2one("res.partner", required=True, tracking=True)
    stand_number = fields.Char(required=True, tracking=True)
    product_id = fields.Many2one("lakecity.loan.product", tracking=True)
    term_months = fields.Integer(required=True, default=36, tracking=True)
    due_day = fields.Integer(default=5, tracking=True)
    payment_start_date = fields.Date(required=True, default=fields.Date.context_today, tracking=True)

    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id.id, required=True)
    total_price = fields.Monetary(required=True, tracking=True)
    deposit_amount = fields.Monetary(default=0.0, tracking=True)
    tax_rate = fields.Float(string="Tax Rate (%)", default=0.0, tracking=True)
    is_vat_inclusive = fields.Boolean(default=True, tracking=True)

    agreement_signed_seller = fields.Boolean(default=False, tracking=True)
    agreement_signed_buyer = fields.Boolean(default=False, tracking=True)
    agreement_file_url = fields.Char(tracking=True)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("active", "Active"),
            ("closed", "Closed"),
            ("defaulted", "Defaulted"),
        ],
        default="draft",
        required=True,
        tracking=True,
    )

    installment_ids = fields.One2many("lakecity.loan.installment", "contract_id")
    payment_ids = fields.One2many("lakecity.loan.payment", "contract_id")

    total_with_tax = fields.Monetary(compute="_compute_totals", store=True)
    financed_amount = fields.Monetary(compute="_compute_totals", store=True)
    recurring_invoice_amount = fields.Monetary(
        string="Recurring Invoice Amount",
        compute="_compute_totals",
        store=True,
        help="(Total including tax - deposit) / term.",
    )
    total_paid = fields.Monetary(compute="_compute_collection_metrics", store=True)
    current_balance = fields.Monetary(compute="_compute_collection_metrics", store=True)
    accrued_amount = fields.Monetary(compute="_compute_collection_metrics", store=True)
    current_due_amount = fields.Monetary(compute="_compute_collection_metrics", store=True)
    next_payment_due_amount = fields.Monetary(compute="_compute_collection_metrics", store=True)
    next_payment_date = fields.Date(compute="_compute_collection_metrics", store=True)
    days_overdue = fields.Integer(compute="_compute_collection_metrics", store=True)

    _sql_constraints = [
        ("lakecity_loan_contract_external_uid_unique", "unique(external_uid)", "External contract UID must be unique."),
    ]

    @api.model
    def _lakecity_normalize_stand(self, stand):
        return str(stand or "").strip().upper()

    @api.constrains("stand_number")
    def _lakecity_check_stand_unique(self):
        """Stand number is the master key: one active loan shell per physical stand."""
        for rec in self:
            stand = self._lakecity_normalize_stand(rec.stand_number)
            if not stand:
                raise ValidationError(_("Stand number is required on a Lakecity loan contract."))
            dup = self.search_count([("stand_number", "=", stand), ("id", "!=", rec.id)])
            if dup:
                raise ValidationError(_("Stand %s already has a Lakecity loan contract.") % stand)

    @api.model_create_multi
    def create(self, vals_list):
        seq = self.env["ir.sequence"]
        for vals in vals_list:
            if vals.get("stand_number"):
                vals["stand_number"] = self._lakecity_normalize_stand(vals["stand_number"])
            if vals.get("name", "New") == "New":
                vals["name"] = seq.next_by_code("lakecity.loan.contract") or "New"
            if vals.get("product_id") and not vals.get("term_months"):
                product = self.env["lakecity.loan.product"].browse(vals["product_id"])
                vals["term_months"] = product.term_months
        records = super().create(vals_list)
        records._lakecity_sync_partner_customer_and_crm()
        return records

    def write(self, vals):
        if vals.get("stand_number"):
            vals["stand_number"] = self._lakecity_normalize_stand(vals["stand_number"])
        res = super().write(vals)
        self._lakecity_sync_partner_customer_and_crm()
        return res

    def _lakecity_sync_partner_customer_and_crm(self):
        """Every BNPL debtor: Accounting customer partner + CRM opportunity keyed with stand + contract UID."""
        for rec in self:
            if rec.partner_id and rec.external_uid and rec.stand_number:
                rec._lakecity_ensure_partner_is_customer()
                rec._lakecity_sync_crm_opportunity()

    def _lakecity_ensure_partner_is_customer(self):
        """Visible under Accounting → Customers when customer_rank exists (Sales / Accounting modules)."""
        self.ensure_one()
        partner = self.partner_id.sudo()
        if "customer_rank" not in partner._fields:
            return
        if not partner.customer_rank:
            partner.write({"customer_rank": 1})

    def _lakecity_sync_crm_opportunity(self):
        """Keep CRM in lockstep with the loan (stand_number on lead + matching partner_id)."""
        self.ensure_one()
        Lead = self.env["crm.lead"].sudo()
        lead = Lead.search([("lakecity_contract_external_uid", "=", self.external_uid)], limit=1)
        pname = self.partner_id.name or _("Lakecity Customer")
        vals = {
            "name": "Stand %s — %s" % (self.stand_number, pname),
            "partner_id": self.partner_id.id,
            "contact_name": pname,
            "email_from": self.partner_id.email or False,
            "phone": self.partner_id.phone or False,
            "lakecity_contract_external_uid": self.external_uid,
            "lakecity_stand_number": self.stand_number,
            "type": "opportunity",
        }
        team = self.env["crm.team"].sudo().search([], order="sequence,id", limit=1)
        if team:
            vals["team_id"] = team.id
        if lead:
            lead.write(vals)
        else:
            Lead.create(vals)

    @api.onchange("product_id")
    def _onchange_product_id(self):
        for rec in self:
            if rec.product_id and rec.product_id.term_months:
                rec.term_months = rec.product_id.term_months

    @api.depends("total_price", "tax_rate", "is_vat_inclusive", "deposit_amount", "term_months")
    def _compute_totals(self):
        for rec in self:
            base = rec.total_price or 0.0
            if rec.is_vat_inclusive:
                total_with_tax = base
            else:
                total_with_tax = base * (1.0 + ((rec.tax_rate or 0.0) / 100.0))
            financed = max(total_with_tax - (rec.deposit_amount or 0.0), 0.0)
            rec.total_with_tax = total_with_tax
            rec.financed_amount = financed
            rec.recurring_invoice_amount = financed / rec.term_months if rec.term_months else 0.0

    @api.depends(
        "deposit_amount",
        "payment_ids.amount",
        "payment_ids.state",
        "installment_ids.amount_due",
        "installment_ids.amount_paid",
        "installment_ids.due_date",
    )
    def _compute_collection_metrics(self):
        today = fields.Date.context_today(self)
        for rec in self:
            posted_payments = sum(p.amount for p in rec.payment_ids if p.state == "posted")
            rec.total_paid = (rec.deposit_amount or 0.0) + posted_payments
            rec.current_balance = max((rec.total_with_tax or 0.0) - rec.total_paid, 0.0)

            overdue_lines = rec.installment_ids.filtered(
                lambda l: l.due_date and l.due_date < today and l.amount_outstanding > 0
            )
            rec.accrued_amount = sum(l.amount_outstanding for l in overdue_lines)

            current_lines = rec.installment_ids.filtered(
                lambda l: l.due_date and l.due_date >= today and l.amount_outstanding > 0
            ).sorted(key=lambda l: l.due_date)
            rec.current_due_amount = current_lines[0].amount_outstanding if current_lines else 0.0
            rec.next_payment_due_amount = rec.accrued_amount + rec.current_due_amount
            rec.next_payment_date = current_lines[0].due_date if current_lines else False

            if overdue_lines:
                oldest = min(overdue_lines.mapped("due_date"))
                rec.days_overdue = (today - oldest).days if oldest else 0
            else:
                rec.days_overdue = 0

    def action_activate(self):
        for rec in self:
            rec.state = "active"
            if not rec.installment_ids:
                rec.action_generate_schedule()

    def action_close(self):
        self.write({"state": "closed"})

    def action_generate_schedule(self):
        for rec in self:
            rec.installment_ids.unlink()
            if rec.term_months <= 0:
                continue
            amount = rec.recurring_invoice_amount
            base_date = rec.payment_start_date or fields.Date.context_today(self)
            lines = []
            for i in range(rec.term_months):
                due = fields.Date.to_date(base_date) + relativedelta(months=i)
                due = due.replace(day=min(max(rec.due_day or 5, 1), 28))
                lines.append(
                    {
                        "contract_id": rec.id,
                        "sequence": i + 1,
                        "due_date": due,
                        "amount_due": amount,
                        "amount_paid": 0.0,
                    }
                )
            self.env["lakecity.loan.installment"].create(lines)
            rec._rebuild_payment_allocations()

    def _rebuild_payment_allocations(self):
        for rec in self:
            for inst in rec.installment_ids:
                inst.amount_paid = 0.0
            remaining_pool = sum(p.amount for p in rec.payment_ids if p.state == "posted")
            for inst in rec.installment_ids.sorted(key=lambda l: (l.due_date or fields.Date.today(), l.sequence)):
                if remaining_pool <= 0:
                    break
                pay = min(inst.amount_due, remaining_pool)
                inst.amount_paid = pay
                remaining_pool -= pay
