# -*- coding: utf-8 -*-
from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import float_round


# Term lengths shipped with the legacy spreadsheet templates.
TERM_SELECTION = [
    ("12", "12 months"),
    ("24", "24 months"),
    ("36", "36 months"),
    ("48", "48 months"),
    ("60", "60 months"),
    ("72", "72 months"),
    ("84", "84 months"),
    ("96", "96 months"),
    ("120", "120 months"),
]


class CollectionSchedule(models.Model):
    """One record per Stand. Mirrors the Collection Schedule spreadsheet."""

    _name = "lakecity.collection.schedule"
    _description = "Lakecity Collection Schedule"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "stand_number"
    _rec_name = "display_name"

    # ------------------------------------------------------------------
    # Identity / customer (CS columns A-F)
    # ------------------------------------------------------------------
    stand_number = fields.Char(
        string="Stand Number",
        required=True,
        index=True,
        copy=False,
        tracking=True,
        help="Globally unique stand identifier — column A on the spreadsheet.",
    )
    display_name = fields.Char(compute="_compute_display_name", store=True)
    partner_id = fields.Many2one(
        "res.partner",
        string="Customer",
        required=True,
        tracking=True,
        ondelete="restrict",
        index=True,
    )
    first_name = fields.Char(string="First Name", tracking=True)
    last_name = fields.Char(string="Last Name", tracking=True)
    contact_number = fields.Char(
        string="Contact Number",
        related="partner_id.phone",
        store=True,
        readonly=False,
    )
    email = fields.Char(
        string="Email",
        related="partner_id.email",
        store=True,
        readonly=False,
    )
    customer_category = fields.Selection(
        selection=[
            ("internal_tester", "Internal Tester"),
            ("standard", "Standard"),
            ("vip", "VIP"),
            ("staff", "Staff"),
            ("partner", "Partner / Reseller"),
        ],
        string="Customer Category",
        default="standard",
        required=True,
        tracking=True,
    )

    # ------------------------------------------------------------------
    # Pricing (CS columns G-L)
    # ------------------------------------------------------------------
    company_id = fields.Many2one(
        "res.company", default=lambda self: self.env.company, required=True
    )
    currency_id = fields.Many2one(
        "res.currency",
        related="company_id.currency_id",
        store=True,
        readonly=True,
    )
    documentation_fee = fields.Monetary(string="Documentation Fee", tracking=True)
    deposit = fields.Monetary(string="Deposit", tracking=True)
    total_price = fields.Monetary(string="Total Price", required=True, tracking=True)
    term_months = fields.Selection(
        TERM_SELECTION,
        string="Term",
        required=True,
        default="24",
        tracking=True,
        help="Number of months covered by the schedule (12 → 120).",
    )
    number_of_installments = fields.Integer(
        string="Number of Installments",
        compute="_compute_number_of_installments",
        store=True,
        readonly=False,
        tracking=True,
    )
    payment_amount = fields.Monetary(
        string="Monthly Payment",
        compute="_compute_payment_amount",
        store=True,
        help="ROUND((total_price - deposit) / installments, 2)",
    )
    start_date = fields.Date(
        string="Start Date",
        required=True,
        tracking=True,
        help="Must fall on the 5th — recurring installments are due on the 5th of every month.",
    )
    end_date = fields.Date(
        string="End Date", compute="_compute_end_date", store=True
    )

    # ------------------------------------------------------------------
    # Monthly payment lines + computed totals (CS cols M..FX, FY-GB)
    # ------------------------------------------------------------------
    payment_line_ids = fields.One2many(
        "lakecity.collection.payment",
        "schedule_id",
        string="Monthly Payments",
        copy=True,
    )
    next_payment_date = fields.Date(
        string="Next Payment Due",
        compute="_compute_progress",
        store=True,
        help="First scheduled month with no payment captured yet.",
    )
    total_paid = fields.Monetary(
        string="Total Paid",
        compute="_compute_progress",
        store=True,
        help="Deposit plus the sum of monthly amounts captured.",
    )
    current_balance = fields.Monetary(
        string="Current Balance",
        compute="_compute_progress",
        store=True,
        help="Total Price − Total Paid.",
    )
    payment_progress = fields.Float(
        string="Payment Progress",
        compute="_compute_progress",
        store=True,
        aggregator="avg",
        help="Total Paid / Total Price (0.0–1.0).",
    )

    # ------------------------------------------------------------------
    # Operational / legal columns (CS cols GC-GL)
    # ------------------------------------------------------------------
    receipts_notes = fields.Text(
        string="Receipts",
        help="Free-form receipts log — matches the 'Receipts' column on the spreadsheet. "
        "Use the chatter to attach scanned receipt files.",
    )
    present_y = fields.Boolean(string="Present Y", tracking=True)
    offer_received = fields.Boolean(string="Offer Received", tracking=True)
    offer_received_date = fields.Date(string="Offer Received Date")
    initial_payment_completed = fields.Boolean(
        string="Initial Payment Completed", tracking=True
    )
    initial_payment_date = fields.Date(string="Initial Payment Date")
    agreement_requested = fields.Boolean(string="Agreement Requested", tracking=True)
    agreement_requested_date = fields.Date(string="Agreement Requested Date")
    agreement_signed_by_warwickshire = fields.Boolean(
        string="Agreement Signed by Warwickshire", tracking=True
    )
    agreement_signed_by_warwickshire_date = fields.Date(
        string="Warwickshire Signature Date"
    )
    agreement_signed_by_client = fields.Boolean(
        string="Agreement Signed by Client", tracking=True
    )
    agreement_signed_by_client_date = fields.Date(string="Client Signature Date")
    agreement_type = fields.Selection(
        [("vat", "VAT"), ("non_vat", "Non-VAT")],
        string="Agreement Type",
        tracking=True,
    )
    agreement_of_sale_file = fields.Binary(
        string="Agreement of Sale File", attachment=True
    )
    agreement_of_sale_filename = fields.Char(string="Agreement Filename")
    registered = fields.Boolean(string="Registered", tracking=True)
    registered_date = fields.Date(string="Registered Date")

    # CRM-style stage derived from the legal/operational booleans.
    state = fields.Selection(
        [
            ("lead", "Lead"),
            ("offer", "Offer Received"),
            ("deposit", "Deposit Paid"),
            ("agreement", "Agreement In Progress"),
            ("signed", "Agreement Signed"),
            ("registered", "Registered"),
        ],
        string="Stage",
        compute="_compute_state",
        store=True,
        tracking=True,
    )

    _sql_constraints = [
        (
            "stand_number_company_uniq",
            "unique(stand_number, company_id)",
            "Stand Number must be unique within a company.",
        ),
    ]

    # ------------------------------------------------------------------
    # Constraints
    # ------------------------------------------------------------------
    @api.constrains("start_date")
    def _check_start_date_is_5th(self):
        for rec in self:
            if rec.start_date and rec.start_date.day != 5:
                raise ValidationError(
                    _(
                        "Start Date must fall on the 5th of the month "
                        "(business rule from the legacy Collection Schedule)."
                    )
                )

    @api.constrains("total_price", "deposit", "documentation_fee")
    def _check_amounts_non_negative(self):
        for rec in self:
            if rec.total_price < 0 or rec.deposit < 0 or rec.documentation_fee < 0:
                raise ValidationError(_("Amounts cannot be negative."))
            if rec.deposit > rec.total_price:
                raise ValidationError(
                    _("Deposit cannot exceed Total Price (Stand %s).") % rec.stand_number
                )

    # ------------------------------------------------------------------
    # Computes
    # ------------------------------------------------------------------
    @api.depends("stand_number", "partner_id", "partner_id.name")
    def _compute_display_name(self):
        for rec in self:
            parts = [p for p in [rec.stand_number, rec.partner_id.display_name] if p]
            rec.display_name = " — ".join(parts) if parts else _("New Stand")

    @api.depends("term_months")
    def _compute_number_of_installments(self):
        for rec in self:
            if rec.term_months and not rec.number_of_installments:
                rec.number_of_installments = int(rec.term_months)

    @api.depends("total_price", "deposit", "number_of_installments")
    def _compute_payment_amount(self):
        for rec in self:
            n = rec.number_of_installments or 0
            if n <= 0:
                rec.payment_amount = 0.0
                continue
            base = (rec.total_price or 0.0) - (rec.deposit or 0.0)
            rec.payment_amount = float_round(base / n, precision_digits=2)

    @api.depends("start_date", "term_months")
    def _compute_end_date(self):
        for rec in self:
            if rec.start_date and rec.term_months:
                rec.end_date = rec.start_date + relativedelta(
                    months=int(rec.term_months) - 1
                )
            else:
                rec.end_date = False

    @api.depends(
        "deposit",
        "total_price",
        "payment_line_ids.amount_paid",
        "payment_line_ids.due_date",
    )
    def _compute_progress(self):
        for rec in self:
            paid_lines = rec.payment_line_ids.filtered(lambda p: p.amount_paid)
            monthly_paid = sum(paid_lines.mapped("amount_paid"))
            total_paid = (rec.deposit or 0.0) + monthly_paid
            rec.total_paid = total_paid
            rec.current_balance = (rec.total_price or 0.0) - total_paid
            rec.payment_progress = (
                total_paid / rec.total_price if rec.total_price else 0.0
            )
            unpaid = rec.payment_line_ids.filtered(lambda p: not p.amount_paid).sorted(
                "due_date"
            )
            rec.next_payment_date = unpaid[:1].due_date or False

    @api.depends(
        "offer_received",
        "initial_payment_completed",
        "agreement_requested",
        "agreement_signed_by_warwickshire",
        "agreement_signed_by_client",
        "registered",
    )
    def _compute_state(self):
        for rec in self:
            if rec.registered:
                rec.state = "registered"
            elif rec.agreement_signed_by_client and rec.agreement_signed_by_warwickshire:
                rec.state = "signed"
            elif rec.agreement_requested:
                rec.state = "agreement"
            elif rec.initial_payment_completed:
                rec.state = "deposit"
            elif rec.offer_received:
                rec.state = "offer"
            else:
                rec.state = "lead"

    # ------------------------------------------------------------------
    # Onchanges (UX helpers — never replace the workflow)
    # ------------------------------------------------------------------
    @api.onchange("partner_id")
    def _onchange_partner_id(self):
        for rec in self:
            if rec.partner_id and not rec.first_name and not rec.last_name:
                # Best-effort split of partner.name into first/last for display parity
                # with the legacy spreadsheet columns B and C.
                name = (rec.partner_id.name or "").strip()
                if name:
                    parts = name.split(" ", 1)
                    rec.first_name = parts[0]
                    rec.last_name = parts[1] if len(parts) > 1 else ""

    @api.onchange("offer_received")
    def _onchange_offer_received(self):
        if self.offer_received and not self.offer_received_date:
            self.offer_received_date = fields.Date.context_today(self)

    @api.onchange("agreement_requested")
    def _onchange_agreement_requested(self):
        if self.agreement_requested and not self.agreement_requested_date:
            self.agreement_requested_date = fields.Date.context_today(self)

    @api.onchange("agreement_signed_by_warwickshire")
    def _onchange_warwickshire_signed(self):
        if (
            self.agreement_signed_by_warwickshire
            and not self.agreement_signed_by_warwickshire_date
        ):
            self.agreement_signed_by_warwickshire_date = fields.Date.context_today(self)

    @api.onchange("agreement_signed_by_client")
    def _onchange_client_signed(self):
        if (
            self.agreement_signed_by_client
            and not self.agreement_signed_by_client_date
        ):
            self.agreement_signed_by_client_date = fields.Date.context_today(self)

    @api.onchange("registered")
    def _onchange_registered(self):
        if self.registered and not self.registered_date:
            self.registered_date = fields.Date.context_today(self)

    # ------------------------------------------------------------------
    # CRUD — auto-generate monthly payment lines
    # ------------------------------------------------------------------
    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if not rec.payment_line_ids and rec.start_date and rec.term_months:
                rec._generate_payment_lines()
        return records

    def write(self, vals):
        regenerate_keys = {"start_date", "term_months"}
        res = super().write(vals)
        if regenerate_keys & set(vals.keys()):
            for rec in self:
                if rec.start_date and rec.term_months:
                    rec._sync_payment_lines()
        return res

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _generate_payment_lines(self):
        """Create one payment line per month for this schedule."""
        self.ensure_one()
        Line = self.env["lakecity.collection.payment"]
        lines = []
        for i in range(int(self.term_months)):
            due = self.start_date + relativedelta(months=i)
            lines.append(
                {
                    "schedule_id": self.id,
                    "due_date": due,
                    "month_index": i + 1,
                }
            )
        if lines:
            Line.create(lines)

    def _sync_payment_lines(self):
        """Re-align lines with the (possibly updated) start_date / term_months.

        Existing captured payments are preserved by ``due_date`` match. Extra
        lines beyond the new term that have no payment captured are removed.
        """
        self.ensure_one()
        n = int(self.term_months)
        expected_dates = [
            self.start_date + relativedelta(months=i) for i in range(n)
        ]
        existing_by_date = {p.due_date: p for p in self.payment_line_ids}

        # Drop empty obsolete lines outside the new range.
        for line in self.payment_line_ids:
            if line.due_date not in expected_dates and not line.amount_paid:
                line.unlink()

        # Create missing months.
        Line = self.env["lakecity.collection.payment"]
        to_create = []
        for i, due in enumerate(expected_dates):
            if due not in existing_by_date:
                to_create.append(
                    {
                        "schedule_id": self.id,
                        "due_date": due,
                        "month_index": i + 1,
                    }
                )
            else:
                existing_by_date[due].month_index = i + 1
        if to_create:
            Line.create(to_create)

    # ------------------------------------------------------------------
    # User actions
    # ------------------------------------------------------------------
    def action_mark_initial_payment(self):
        for rec in self:
            rec.initial_payment_completed = True
            if not rec.initial_payment_date:
                rec.initial_payment_date = fields.Date.context_today(self)

    def action_register(self):
        for rec in self:
            rec.registered = True
            if not rec.registered_date:
                rec.registered_date = fields.Date.context_today(self)

    def action_open_payment_lines(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Monthly Payments — %s") % self.stand_number,
            "res_model": "lakecity.collection.payment",
            "view_mode": "list,pivot,form",
            "domain": [("schedule_id", "=", self.id)],
            "context": {"default_schedule_id": self.id},
        }
