# -*- coding: utf-8 -*-
import calendar
import logging
from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_is_zero

_logger = logging.getLogger(__name__)


class LakecityLoanContract(models.Model):
    _name = "lakecity.loan.contract"
    _description = "Lakecity Loan Contract"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "create_date desc"

    name = fields.Char(default="New", readonly=True, copy=False, tracking=True)
    external_uid = fields.Char(copy=False, tracking=True, index=True)
    partner_id = fields.Many2one("res.partner", string="Customer", required=True, tracking=True)
    stand_number = fields.Char(required=True, tracking=True)
    product_id = fields.Many2one("lakecity.loan.product", tracking=True)
    term_months = fields.Integer(required=True, default=36, tracking=True)
    due_day = fields.Integer(
        default=5,
        tracking=True,
        help="Payments target this calendar day each month after schedule generation (default 5 = 5th).",
    )
    payment_start_date = fields.Date(required=True, default=fields.Date.context_today, tracking=True)

    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id.id, required=True)
    company_id = fields.Many2one(
        "res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    lakecity_future_receivable_move_id = fields.Many2one(
        "account.move",
        string="Future receivable (GL)",
        readonly=True,
        copy=False,
        check_company=True,
    )
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
        string="Monthly payment",
        compute="_compute_totals",
        store=True,
        help="Rounded equal installment (shown). Schedule generation allocates any currency remainder on the last installment so lines sum to the financed amount.",
    )
    total_paid = fields.Monetary(compute="_compute_collection_metrics", store=True)
    current_balance = fields.Monetary(compute="_compute_collection_metrics", store=True)
    accrued_amount = fields.Monetary(compute="_compute_collection_metrics", store=True)
    current_due_amount = fields.Monetary(compute="_compute_collection_metrics", store=True)
    next_payment_due_amount = fields.Monetary(compute="_compute_collection_metrics", store=True)
    next_payment_date = fields.Date(compute="_compute_collection_metrics", store=True)
    days_overdue = fields.Integer(compute="_compute_collection_metrics", store=True)

    _lakecity_loan_contract_external_uid_unique = models.Constraint(
        "unique(external_uid)",
        "External contract UID must be unique.",
    )

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

    @api.constrains("due_day")
    def _check_due_day(self):
        for rec in self:
            if rec.due_day < 1 or rec.due_day > 31:
                raise ValidationError(_("Contract due day must be between 1 and 31."))

    @staticmethod
    def _lakecity_clamp_day_in_month(year, month, day_desired):
        last = calendar.monthrange(year, month)[1]
        return min(max(day_desired, 1), last)

    def _lakecity_nth_installment_due_date(self, index):
        """Return due date for installment index >= 0: same calendar day monthly, first ≥ payment_start_date."""
        self.ensure_one()
        anchor = fields.Date.to_date(self.payment_start_date or fields.Date.context_today(self))
        tgt = min(max(self.due_day or 5, 1), 31)
        yy, mm = anchor.year, anchor.month
        d0 = self._lakecity_clamp_day_in_month(yy, mm, tgt)
        cand = anchor.replace(day=d0)
        if cand < anchor:
            cand = cand + relativedelta(months=1)
            d1 = self._lakecity_clamp_day_in_month(cand.year, cand.month, tgt)
            first_due = cand.replace(day=d1)
        else:
            first_due = cand
        if index <= 0:
            return first_due
        nxt = first_due + relativedelta(months=index)
        dd = self._lakecity_clamp_day_in_month(nxt.year, nxt.month, tgt)
        return nxt.replace(day=dd)

    @api.model_create_multi
    def create(self, vals_list):
        seq = self.env["ir.sequence"]
        for vals in vals_list:
            if vals.get("stand_number"):
                vals["stand_number"] = self._lakecity_normalize_stand(vals["stand_number"])
            if vals.get("name", "New") == "New":
                vals["name"] = seq.next_by_code("lakecity.loan.contract") or "New"
            if vals.get("product_id"):
                product = self.env["lakecity.loan.product"].browse(vals["product_id"])
                if "term_months" not in vals:
                    vals["term_months"] = product.term_months
                if "due_day" not in vals:
                    vals["due_day"] = product.due_day
        records = super().create(vals_list)
        records._lakecity_sync_partner_customer_and_crm()
        records._lakecity_sync_future_receivable_gl()
        return records

    def write(self, vals):
        if vals.get("stand_number"):
            vals["stand_number"] = self._lakecity_normalize_stand(vals["stand_number"])
        res = super().write(vals)
        self._lakecity_sync_partner_customer_and_crm()
        if not self.env.context.get("skip_lakecity_bnpl_gl_sync"):
            self._lakecity_sync_future_receivable_gl()
        return res

    def unlink(self):
        self._lakecity_clear_future_receivable_gl()
        return super().unlink()

    def _lakecity_sync_partner_customer_and_crm(self):
        """Every BNPL debtor: Accounting customer partner + CRM opportunity keyed with stand + contract UID."""
        for rec in self:
            if rec.partner_id:
                rec._lakecity_ensure_partner_is_customer()
                if rec.external_uid:
                    rec.partner_id.commercial_partner_id._lakecity_ensure_dedicated_receivable_accounts()
            if rec.partner_id and rec.external_uid and rec.stand_number:
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
            if not rec.product_id:
                continue
            if rec.product_id.term_months:
                rec.term_months = rec.product_id.term_months
            if rec.product_id.due_day:
                rec.due_day = rec.product_id.due_day

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
        self.write({"state": "active"})
        for rec in self:
            if not rec.installment_ids:
                rec.action_generate_schedule()

    def action_close(self):
        self.write({"state": "closed"})

    def action_generate_schedule(self):
        for rec in self:
            rec.installment_ids.unlink()
            if rec.term_months <= 0:
                continue
            financed = rec.financed_amount or 0.0
            n = rec.term_months
            cur = rec.currency_id or rec.company_id.currency_id
            if float_is_zero(financed, precision_rounding=cur.rounding):
                raise ValidationError(
                    _(
                        "Cannot generate installments: financed amount is zero. "
                        "Set Total price (and VAT if applicable) above the deposit so the BNPL principal is positive."
                    )
                )
            per = cur.round(financed / n) if n else 0.0
            lines = []
            acc = 0.0
            for i in range(n):
                due = rec._lakecity_nth_installment_due_date(i)
                if i < n - 1:
                    amt = per
                else:
                    amt = cur.round(financed - acc)
                acc = cur.round(acc + amt)
                lines.append(
                    {
                        "contract_id": rec.id,
                        "sequence": i + 1,
                        "due_date": due,
                        "amount_due": amt,
                        "amount_paid": 0.0,
                    }
                )
            self.env["lakecity.loan.installment"].create(lines)
            rec._rebuild_payment_allocations()

    def _lakecity_bnpl_gl_outstanding_balance(self):
        """Outstanding contract balance = total due − deposit − posted loan payments (cash basis)."""
        self.ensure_one()
        posted_payments = sum(p.amount for p in self.payment_ids if p.state == "posted")
        total_paid = (self.deposit_amount or 0.0) + posted_payments
        raw = max((self.total_with_tax or 0.0) - total_paid, 0.0)
        if self.currency_id:
            return self.currency_id.round(raw)
        return raw

    def _lakecity_clear_future_receivable_gl(self):
        """Remove the mirror journal entry (draft/unlink), detach FK first."""
        if "account.move" not in self.env:
            return
        for rec in self:
            move = rec.lakecity_future_receivable_move_id
            if not move:
                continue
            move = move.sudo()
            rec.with_context(skip_lakecity_bnpl_gl_sync=True).write({"lakecity_future_receivable_move_id": False})
            try:
                if move.state == "posted":
                    move.button_draft()
                if move.state == "draft":
                    move.unlink()
                elif move.state == "cancel":
                    move.unlink()
            except Exception as err:
                _logger.warning(
                    "Lakecity BNPL: could not remove GL mirror move id=%s for %s: %s",
                    move.id,
                    rec.display_name,
                    err,
                )

    def _lakecity_sync_future_receivable_gl(self):
        """Post/update one miscellaneous entry: Dr trade receivable / Cr BNPL clearing (future installments)."""
        if "account.move" not in self.env:
            return
        Move = self.env["account.move"].sudo()
        today = fields.Date.context_today(self)
        for rec in self:
            company = rec.company_id.sudo()
            if company.lakecity_bnpl_post_bank_payment_per_receipt:
                rec._lakecity_clear_future_receivable_gl()
                continue
            if not company.lakecity_bnpl_future_receivable_gl_enabled:
                rec._lakecity_clear_future_receivable_gl()
                continue
            if rec.state not in ("active", "defaulted"):
                rec._lakecity_clear_future_receivable_gl()
                continue

            partner = rec.partner_id.commercial_partner_id
            ar_acc = partner.with_company(company).property_account_receivable_id
            if not ar_acc:
                _logger.warning(
                    "Lakecity BNPL: partner %s has no receivable account; skip GL mirror for loan %s",
                    partner.display_name,
                    rec.display_name,
                )
                continue

            balance = rec._lakecity_bnpl_gl_outstanding_balance()
            rnd = rec.currency_id.rounding if rec.currency_id else 0.01
            if float_is_zero(balance, precision_rounding=rnd):
                rec._lakecity_clear_future_receivable_gl()
                continue

            journal = company._lakecity_bnpl_ensure_journal()
            clearing = company._lakecity_bnpl_ensure_clearing_account()
            label = _("Lakecity BNPL future receivable — %s (stand %s)") % (
                rec.name,
                rec.stand_number or "",
            )
            line_specs = [
                {
                    "account_id": ar_acc.id,
                    "partner_id": partner.id,
                    "name": label,
                    "debit": balance,
                    "credit": 0.0,
                },
                {
                    "account_id": clearing.id,
                    "partner_id": False,
                    "name": label,
                    "debit": 0.0,
                    "credit": balance,
                },
            ]
            vals_base = {
                "move_type": "entry",
                "journal_id": journal.id,
                "company_id": company.id,
                "currency_id": rec.currency_id.id,
                "date": today,
                "ref": rec.name,
                "lakecity_loan_contract_id": rec.id,
                "partner_id": partner.id,
            }
            move = rec.lakecity_future_receivable_move_id.sudo()
            try:
                if move:
                    if move.state == "posted":
                        move.button_draft()
                    move.write(dict(vals_base, line_ids=[(5, 0, 0)] + [(0, 0, ln) for ln in line_specs]))
                    move.action_post()
                else:
                    move = Move.create(dict(vals_base, line_ids=[(0, 0, ln) for ln in line_specs]))
                    move.action_post()
                    rec.with_context(skip_lakecity_bnpl_gl_sync=True).write(
                        {"lakecity_future_receivable_move_id": move.id}
                    )
            except Exception as err:
                _logger.warning(
                    "Lakecity BNPL: GL mirror failed for contract %s: %s",
                    rec.display_name,
                    err,
                )

    def action_recompute_installment_states(self):
        """Rebuild posted-payment allocation onto lines, then refresh stored installment computes."""
        contracts = self
        contracts._rebuild_payment_allocations()
        installments = contracts.mapped("installment_ids")
        if installments:
            installments.action_lakecity_refresh_stored_computes()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Installments updated"),
                "message": _("Rebuilt allocations and recomputed installment states for %s contract(s).")
                % len(contracts),
                "type": "success",
                "sticky": False,
            },
        }

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
        self._lakecity_sync_future_receivable_gl()
