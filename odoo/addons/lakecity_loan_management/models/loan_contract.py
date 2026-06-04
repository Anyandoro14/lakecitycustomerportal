# -*- coding: utf-8 -*-
import calendar
import json
import logging
import urllib.error
import urllib.request
from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_is_zero, float_round

_logger = logging.getLogger(__name__)


class LakecityLoanContract(models.Model):
    _name = "lakecity.loan.contract"
    _description = "Lakecity Loan Contract"
    _inherit = ["mail.thread", "mail.activity.mixin", "lakecity.stand.accounting.mixin"]
    _order = "create_date desc"

    name = fields.Char(default="New", readonly=True, copy=False, tracking=True)
    external_uid = fields.Char(copy=False, tracking=True, index=True)
    partner_id = fields.Many2one("res.partner", string="Customer", required=True, tracking=True)
    stand_number = fields.Char(required=True, tracking=True)
    lakecity_stand_cost_id = fields.Many2one(
        "lakecity.stand.cost",
        string="Stand cost master",
        tracking=True,
        help="Authoritative development cost from the inventory costing register.",
    )
    lakecity_stand_phase_id = fields.Many2one(
        "lakecity.stand.phase",
        string="Project phase",
        tracking=True,
        index=True,
        help="Project phase for cost, revenue, and profit reporting.",
    )
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
        help="Posted mirror journal (Dr receivable / Cr BNPL clearing). Amount follows posted BNPL "
        "receipts via installment allocation. If Total with tax is 0, it uses installment balances. "
        "Empty when the company posts a bank payment per BNPL receipt instead of mirroring.",
    )
    total_price = fields.Monetary(required=True, tracking=True)
    deposit_amount = fields.Monetary(default=0.0, tracking=True)
    stand_cost = fields.Monetary(
        string="Stand cost",
        tracking=True,
        help="Cost from Stand Cost Master; drives proportional COS on each payment.",
    )
    tax_rate = fields.Float(string="Tax Rate (%)", default=15.5, tracking=True)
    is_vat_inclusive = fields.Boolean(default=False, tracking=True)
    lakecity_initial_contract_move_id = fields.Many2one(
        "account.move",
        string="Initial contract JE",
        readonly=True,
        copy=False,
        check_company=True,
    )
    lakecity_inventory_reclass_move_id = fields.Many2one(
        "account.move",
        string="Inventory reclass JE",
        readonly=True,
        copy=False,
        check_company=True,
    )
    lakecity_default_reclass_move_id = fields.Many2one(
        "account.move",
        string="Default receivable reclass JE",
        readonly=True,
        copy=False,
        check_company=True,
    )
    lakecity_forfeiture_move_ids = fields.Many2many(
        "account.move",
        "lakecity_loan_contract_forfeiture_move_rel",
        "contract_id",
        "move_id",
        string="Forfeiture JEs",
        readonly=True,
        copy=False,
    )
    lakecity_cancellation_move_ids = fields.Many2many(
        "account.move",
        "lakecity_loan_contract_cancellation_move_rel",
        "contract_id",
        "move_id",
        string="Cancellation JEs",
        readonly=True,
        copy=False,
    )
    lakecity_revenue_recognized = fields.Monetary(readonly=True, copy=False)
    lakecity_vat_released = fields.Monetary(readonly=True, copy=False)
    lakecity_cos_recognized = fields.Monetary(readonly=True, copy=False)
    lakecity_deposit_accounting_done = fields.Boolean(readonly=True, copy=False, default=False)
    lakecity_pass_through_amount = fields.Monetary(
        string="Pass-through amount",
        help="Amount for AOS or conveyancing pass-through receipt JE.",
    )

    agreement_signed_seller = fields.Boolean(default=False, tracking=True)
    agreement_signed_buyer = fields.Boolean(default=False, tracking=True)
    agreement_file_url = fields.Char(tracking=True)

    lakecity_portal_enrolled = fields.Boolean(
        string="Portal enrolled",
        default=False,
        tracking=True,
        help="When enabled, this stand may sign up and view data on the Customer Portal.",
    )
    lakecity_portal_enrolled_at = fields.Datetime(readonly=True, copy=False)
    lakecity_portal_enrolled_by = fields.Many2one(
        "res.users",
        string="Portal enrolled by",
        readonly=True,
        copy=False,
    )
    lakecity_deposit_required = fields.Boolean(
        string="Deposit required",
        default=False,
        tracking=True,
    )
    lakecity_deposit_split_three = fields.Boolean(
        string="Deposit in 3 monthly payments",
        default=False,
        tracking=True,
        help="When set, generate three deposit installments before the main BNPL schedule.",
    )
    lakecity_deposit_due_date = fields.Date(string="Deposit due date", tracking=True)
    lakecity_deposit_date_1 = fields.Date(string="Deposit payment 1", tracking=True)
    lakecity_deposit_date_2 = fields.Date(string="Deposit payment 2", tracking=True)
    lakecity_deposit_date_3 = fields.Date(string="Deposit payment 3", tracking=True)

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
    next_payment_date = fields.Date(
        compute="_compute_collection_metrics",
        store=True,
        help="Due date of the oldest installment with a balance (includes overdue lines).",
    )
    days_overdue = fields.Integer(compute="_compute_collection_metrics", store=True)

    _lakecity_loan_contract_external_uid_unique = models.Constraint(
        "unique(external_uid)",
        "External contract UID must be unique.",
    )

    @api.model
    def _lakecity_normalize_stand(self, stand):
        return self.env["lakecity.stand.cost"]._lakecity_normalize_stand_number(stand)

    def _lakecity_merge_cost_master_vals(self, vals):
        cost = self.env["lakecity.stand.cost"]._lakecity_lookup_by_stand(vals.get("stand_number"))
        if not cost:
            return
        vals.setdefault("lakecity_stand_cost_id", cost.id)
        vals.setdefault("lakecity_stand_phase_id", cost.phase_id.id)
        stand_cost = vals.get("stand_cost")
        if stand_cost is None or float_is_zero(stand_cost or 0.0, precision_rounding=0.01):
            vals["stand_cost"] = cost.total_cost

    @api.onchange("stand_number")
    def _onchange_stand_number_cost_master(self):
        for rec in self:
            cost = self.env["lakecity.stand.cost"]._lakecity_lookup_by_stand(rec.stand_number)
            if cost:
                rec.lakecity_stand_cost_id = cost
                rec.lakecity_stand_phase_id = cost.phase_id
                rec.stand_cost = cost.total_cost

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

    @api.constrains(
        "lakecity_deposit_required",
        "lakecity_deposit_split_three",
        "deposit_amount",
        "lakecity_deposit_due_date",
        "lakecity_deposit_date_1",
        "lakecity_deposit_date_2",
        "lakecity_deposit_date_3",
        "payment_start_date",
    )
    def _lakecity_check_deposit_portal_rules(self):
        for rec in self:
            cur = rec.currency_id or rec.company_id.currency_id
            rnd = cur.rounding or 0.01
            start = rec.payment_start_date
            if not rec.lakecity_deposit_required:
                continue
            if float_is_zero(rec.deposit_amount or 0.0, precision_rounding=rnd):
                raise ValidationError(
                    _("Deposit amount must be greater than zero when Deposit required is enabled.")
                )
            if rec.lakecity_deposit_split_three:
                for label, dt in (
                    (_("Deposit payment 1"), rec.lakecity_deposit_date_1),
                    (_("Deposit payment 2"), rec.lakecity_deposit_date_2),
                    (_("Deposit payment 3"), rec.lakecity_deposit_date_3),
                ):
                    if not dt:
                        raise ValidationError(
                            _("%s is required when deposit is split over three payments.") % label
                        )
                    if start and dt >= start:
                        raise ValidationError(
                            _("%s must be before the BNPL payment start date (%s).") % (label, start)
                        )
            elif not rec.lakecity_deposit_due_date:
                raise ValidationError(
                    _("Deposit due date is required when deposit is required and not split in three.")
                )
            elif start and rec.lakecity_deposit_due_date >= start:
                raise ValidationError(
                    _("Deposit due date must be before the BNPL payment start date (%s).") % start
                )

    @api.onchange("lakecity_deposit_required")
    def _onchange_lakecity_deposit_required(self):
        for rec in self:
            if not rec.lakecity_deposit_required:
                rec.deposit_amount = 0.0
                rec.lakecity_deposit_split_three = False
                rec.lakecity_deposit_due_date = False
                rec.lakecity_deposit_date_1 = False
                rec.lakecity_deposit_date_2 = False
                rec.lakecity_deposit_date_3 = False

    @api.onchange("lakecity_deposit_split_three")
    def _onchange_lakecity_deposit_split_three(self):
        for rec in self:
            if rec.lakecity_deposit_split_three:
                rec.lakecity_deposit_due_date = False
            else:
                rec.lakecity_deposit_date_1 = False
                rec.lakecity_deposit_date_2 = False
                rec.lakecity_deposit_date_3 = False

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

    def _lakecity_split_financed_into_installments(self, financed, n):
        """Split financed principal into n rounded installment amounts using currency minor units (consistent totals)."""
        self.ensure_one()
        cur = self.currency_id or self.company_id.currency_id
        rnd = cur.rounding or 0.01
        if n <= 0:
            return []
        if float_is_zero(financed, precision_rounding=rnd):
            return [0.0] * n
        units = int(round(financed / rnd))
        if units <= 0:
            out = [0.0] * n
            out[-1] = float_round(financed, precision_rounding=rnd)
            return out
        q, rem = divmod(units, n)
        amounts = []
        for i in range(n):
            slice_u = q + (1 if i < rem else 0)
            amounts.append(slice_u * rnd)
        delta = float_round(financed - sum(amounts), precision_rounding=rnd)
        if not float_is_zero(delta, precision_rounding=rnd):
            amounts[-1] = float_round(amounts[-1] + delta, precision_rounding=rnd)
        return amounts

    @api.model_create_multi
    def create(self, vals_list):
        seq = self.env["ir.sequence"]
        for vals in vals_list:
            if vals.get("stand_number"):
                vals["stand_number"] = self._lakecity_normalize_stand(vals["stand_number"])
                self._lakecity_merge_cost_master_vals(vals)
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
        records._lakecity_sync_portal_settings_supabase()
        return records

    _LAKECITY_PORTAL_SYNC_FIELDS = frozenset(
        {
            "stand_number",
            "lakecity_portal_enrolled",
            "lakecity_deposit_required",
            "lakecity_deposit_split_three",
            "lakecity_deposit_due_date",
            "lakecity_deposit_date_1",
            "lakecity_deposit_date_2",
            "lakecity_deposit_date_3",
            "deposit_amount",
            "payment_start_date",
            "term_months",
        }
    )

    def write(self, vals):
        if vals.get("stand_number"):
            vals["stand_number"] = self._lakecity_normalize_stand(vals["stand_number"])
            self._lakecity_merge_cost_master_vals(vals)
        if "lakecity_deposit_required" in vals and not vals.get("lakecity_deposit_required"):
            vals.setdefault("deposit_amount", 0.0)
            vals.setdefault("lakecity_deposit_split_three", False)
            vals.setdefault("lakecity_deposit_due_date", False)
            vals.setdefault("lakecity_deposit_date_1", False)
            vals.setdefault("lakecity_deposit_date_2", False)
            vals.setdefault("lakecity_deposit_date_3", False)
        portal_toggle_on = vals.get("lakecity_portal_enrolled") is True
        if portal_toggle_on:
            vals.setdefault("lakecity_portal_enrolled_at", fields.Datetime.now())
            vals.setdefault("lakecity_portal_enrolled_by", self.env.user.id)
        elif vals.get("lakecity_portal_enrolled") is False:
            vals.setdefault("lakecity_portal_enrolled_at", False)
            vals.setdefault("lakecity_portal_enrolled_by", False)
        res = super().write(vals)
        self._lakecity_sync_partner_customer_and_crm()
        if not self.env.context.get("skip_lakecity_bnpl_gl_sync"):
            self._lakecity_sync_future_receivable_gl()
        if self._LAKECITY_PORTAL_SYNC_FIELDS.intersection(vals.keys()):
            self._lakecity_sync_portal_settings_supabase()
        return res

    def action_enable_portal_enrollment(self):
        """Mark stand as eligible for Customer Portal (sets audit fields)."""
        self.write(
            {
                "lakecity_portal_enrolled": True,
                "lakecity_portal_enrolled_at": fields.Datetime.now(),
                "lakecity_portal_enrolled_by": self.env.user.id,
            }
        )
        return True

    def _lakecity_portal_sync_payload(self):
        self.ensure_one()
        return {
            "stand_number": self.stand_number,
            "odoo_contract_id": self.id,
            "portal_enrolled": bool(self.lakecity_portal_enrolled),
            "deposit_required": bool(self.lakecity_deposit_required),
            "deposit_split_three": bool(self.lakecity_deposit_split_three),
            "deposit_due_date": self.lakecity_deposit_due_date.isoformat()
            if self.lakecity_deposit_due_date
            else None,
            "deposit_date_1": self.lakecity_deposit_date_1.isoformat()
            if self.lakecity_deposit_date_1
            else None,
            "deposit_date_2": self.lakecity_deposit_date_2.isoformat()
            if self.lakecity_deposit_date_2
            else None,
            "deposit_date_3": self.lakecity_deposit_date_3.isoformat()
            if self.lakecity_deposit_date_3
            else None,
            "deposit_amount": float(self.deposit_amount or 0.0),
            "payment_start_date": self.payment_start_date.isoformat()
            if self.payment_start_date
            else None,
            "term_months": int(self.term_months or 0),
        }

    def _lakecity_sync_portal_settings_supabase(self):
        """Push portal enrolment / deposit settings to Supabase edge function (best-effort)."""
        ICP = self.env["ir.config_parameter"].sudo()
        url = (ICP.get_param("lakecity.portal_supabase_sync_url") or "").strip()
        token = (ICP.get_param("lakecity.portal_supabase_sync_token") or "").strip()
        if not url or not token:
            return
        for rec in self:
            if not rec.stand_number:
                continue
            body = json.dumps(rec._lakecity_portal_sync_payload()).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer %s" % token,
                    "User-Agent": "Lakecity-Odoo-PortalSync/1.0",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    if resp.status >= 400:
                        _logger.warning(
                            "Lakecity portal sync HTTP %s for stand %s",
                            resp.status,
                            rec.stand_number,
                        )
            except (urllib.error.URLError, OSError, ValueError) as err:
                _logger.warning(
                    "Lakecity portal sync failed for stand %s: %s",
                    rec.stand_number,
                    err,
                )

    def unlink(self):
        self._lakecity_clear_future_receivable_gl()
        return super().unlink()

    def _lakecity_sync_partner_customer_and_crm(self):
        """Every BNPL debtor: Accounting customer partner + CRM opportunity keyed with stand + contract UID."""
        for rec in self:
            if rec.partner_id:
                rec._lakecity_ensure_partner_is_customer()
                # Point customer at main trade receivable (121000); TB stays consolidated,
                # partner_id on move lines / aged AR shows per-customer balances.
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
            if rec.installment_ids:
                rec.total_paid = sum(rec.installment_ids.mapped("amount_paid"))
            else:
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
            # Next due *date* must reflect the oldest unpaid installment (including overdue).
            # Using only future-due lines pushed next_payment_date forward whenever arrears existed.
            unpaid_any = rec.installment_ids.filtered(lambda l: l.amount_outstanding > 0).sorted(
                key=lambda l: (l.due_date or fields.Date.today(), l.sequence)
            )
            rec.next_payment_date = unpaid_any[0].due_date if unpaid_any else False

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
            if rec._lakecity_company_stand_accounting_enabled():
                if not rec.lakecity_initial_contract_move_id:
                    rec._lakecity_post_initial_contract_recognition()
                rec._lakecity_post_inventory_reclass()
                rec._lakecity_post_deposit_accounting()
                rec._lakecity_clear_future_receivable_gl()

    def action_mark_defaulted(self):
        for rec in self:
            rec._lakecity_post_default_receivable_reclass()
            rec.write({"state": "defaulted"})

    def action_forfeit(self):
        for rec in self:
            rec._lakecity_post_forfeiture_accounting()

    def action_cancel_with_refund(self):
        for rec in self:
            rec._lakecity_post_cancellation_accounting(
                admin_fee_percent=(rec.company_id.lakecity_cancellation_admin_fee_percent or 10.0) / 100.0
            )

    def action_post_aos_pass_through(self):
        for rec in self:
            amount = rec.lakecity_pass_through_amount or 0.0
            rec._lakecity_post_pass_through(amount, "aos")

    def action_post_conveyancing_pass_through(self):
        for rec in self:
            amount = rec.lakecity_pass_through_amount or 0.0
            rec._lakecity_post_pass_through(amount, "conveyancing")

    def action_close(self):
        self.write({"state": "closed"})

    def _lakecity_deposit_installment_specs(self):
        """Return list of dicts for deposit-phase installment lines (sequence, due_date, amount_due)."""
        self.ensure_one()
        if not self.lakecity_deposit_required:
            return []
        cur = self.currency_id or self.company_id.currency_id
        rnd = cur.rounding or 0.01
        gross = self.deposit_amount or 0.0
        if float_is_zero(gross, precision_rounding=rnd):
            return []
        specs = []
        if self.lakecity_deposit_split_three:
            amounts = self._lakecity_split_financed_into_installments(gross, 3)
            dates = (
                self.lakecity_deposit_date_1,
                self.lakecity_deposit_date_2,
                self.lakecity_deposit_date_3,
            )
            for seq, (due, amt) in enumerate(zip(dates, amounts), start=1):
                specs.append({"sequence": seq, "due_date": due, "amount_due": amt})
        else:
            specs.append(
                {
                    "sequence": 1,
                    "due_date": self.lakecity_deposit_due_date,
                    "amount_due": gross,
                }
            )
        return specs

    def action_generate_schedule(self):
        # sudo(): regenerate deletes/recreates installments; Loan Users only have read ACL on
        # installment lines, but must still run schedule/recompute flows from the contract form.
        Installment = self.env["lakecity.loan.installment"]
        for rec in self.sudo():
            rec.installment_ids.unlink()
            lines = []
            seq_offset = 0
            deposit_specs = rec._lakecity_deposit_installment_specs()
            for spec in deposit_specs:
                lines.append(
                    {
                        "contract_id": rec.id,
                        "sequence": spec["sequence"],
                        "due_date": spec["due_date"],
                        "amount_due": spec["amount_due"],
                        "amount_paid": 0.0,
                        "installment_kind": "deposit",
                    }
                )
            seq_offset = len(deposit_specs)
            if rec.term_months <= 0:
                if lines:
                    Installment.create(lines)
                    rec._rebuild_payment_allocations()
                continue
            financed = rec.financed_amount or 0.0
            n = rec.term_months
            cur = rec.currency_id or rec.company_id.currency_id
            if float_is_zero(financed, precision_rounding=cur.rounding):
                if deposit_specs:
                    Installment.create(lines)
                    rec._rebuild_payment_allocations()
                    continue
                raise ValidationError(
                    _(
                        "Cannot generate installments: financed amount is zero. "
                        "Set Total price (and VAT if applicable) above the deposit so the BNPL principal is positive."
                    )
                )
            amounts = rec._lakecity_split_financed_into_installments(financed, n)
            for i in range(n):
                due = rec._lakecity_nth_installment_due_date(i)
                lines.append(
                    {
                        "contract_id": rec.id,
                        "sequence": seq_offset + i + 1,
                        "due_date": due,
                        "amount_due": amounts[i],
                        "amount_paid": 0.0,
                        "installment_kind": "regular",
                    }
                )
            Installment.create(lines)
            rec._rebuild_payment_allocations()

    def _lakecity_try_repair_zero_schedule(self):
        """Regenerate schedule when financed principal is positive but every installment amount due is zero; returns True if a run occurred."""
        self.ensure_one()
        lines = self.installment_ids
        if not lines:
            return False
        cur = self.currency_id or self.company_id.currency_id
        rnd = cur.rounding or 0.01
        financed = self.financed_amount or 0.0
        if float_is_zero(financed, precision_rounding=rnd):
            return False
        if not all(float_is_zero(l.amount_due, precision_rounding=rnd) for l in lines):
            return False
        self.action_generate_schedule()
        return True

    def action_repair_zero_amount_schedule(self):
        """Button / batch action: fix contracts whose installments are all zero-due incorrectly."""
        repaired = self.browse()
        for rec in self.sudo():
            if rec._lakecity_try_repair_zero_schedule():
                repaired |= rec
        if len(self) == 1 and not repaired:
            rec = self.sudo()
            cur = rec.currency_id or rec.company_id.currency_id
            rnd = cur.rounding or 0.01
            fin = rec.financed_amount or 0.0
            if not rec.installment_ids:
                raise ValidationError(_("Create installments first (Generate Schedule)."))
            if float_is_zero(fin, precision_rounding=rnd):
                raise ValidationError(_("Financed amount is zero; raise Total price above Deposit first."))
            raise ValidationError(
                _("This contract is not in the “all installment dues are zero” state; use Generate Schedule if you need a full rebuild.")
            )
        msg = (
            _("Repaired %(n)s contract(s) with zero installment amounts.") % {"n": len(repaired)}
            if repaired
            else _("No contracts matched (need financed > 0 and every installment Amount due = 0).")
        )
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Schedule repair"),
                "message": msg,
                "type": "success" if repaired else "warning",
                "sticky": bool(repaired),
            },
        }

    def _lakecity_bnpl_gl_outstanding_balance(self):
        """Outstanding balance for BNPL GL mirror: contract formula when total_with_tax is set, else sum of unpaid installment balances."""
        self.ensure_one()
        posted_payments = sum(p.amount for p in self.payment_ids if p.state == "posted")
        total_paid = (self.deposit_amount or 0.0) + posted_payments
        rnd = self.currency_id.rounding if self.currency_id else 0.01

        contract_raw = max((self.total_with_tax or 0.0) - total_paid, 0.0)
        sched_raw = 0.0
        for line in self.installment_ids:
            sched_raw += max(line.amount_due - line.amount_paid, 0.0)

        if float_is_zero(self.total_with_tax or 0.0, precision_rounding=rnd) and self.installment_ids:
            raw = sched_raw
        else:
            raw = contract_raw

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
            if company.lakecity_stand_sales_accounting_enabled:
                rec._lakecity_clear_future_receivable_gl()
                continue
            if rec.lakecity_initial_contract_move_id:
                rec._lakecity_clear_future_receivable_gl()
                continue
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
            ar_acc = company._lakecity_trade_receivable_account()
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
        # sudo: loan users often have read-only ACL on installments; allocation must write amount_paid.
        contracts = self.sudo()
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
