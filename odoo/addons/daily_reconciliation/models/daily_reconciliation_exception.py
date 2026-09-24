# -*- coding: utf-8 -*-
"""Daily reconciliation exception queue.

Issue codes match docs/bnpl-accounting-cutover-and-daily-reconcile.md and
scripts/daily-bnpl-three-way-reconcile.mjs — do not invent parallel taxonomies.
"""
import hashlib

from odoo import _, api, fields, models

# Kept in sync with scripts/daily-bnpl-three-way-reconcile.mjs issue codes.
MISMATCH_TYPES = [
    ("pre_cutoff_hit_bank", "Pre-cutoff hit bank"),
    ("missing_receipt_unposted", "Missing receipt (unposted)"),
    ("amount_mismatch", "Amount mismatch"),
    ("balance_mismatch", "Balance mismatch"),
    ("stand_price_mismatch", "Stand price mismatch"),
    ("manual_total_error", "Manual total error"),
    ("wrong_date_day_month_swap", "Wrong date (day/month swap)"),
    ("ambiguous_date_day_month", "Ambiguous date (day/month)"),
    ("unparseable_date", "Unparseable date"),
    ("liquidity_account_unexpected", "Liquidity account unexpected"),
    ("missing_in_odoo", "Missing in Odoo"),
    ("missing_in_collection", "Missing in Collection"),
    ("orphaned_bank_line", "Orphaned bank line"),
    ("other", "Other"),
]

SEVERITIES = [
    ("critical", "Critical"),
    ("high", "High"),
    ("medium", "Medium"),
    ("low", "Low"),
]

STATES = [
    ("open", "Open"),
    ("matched", "Matched"),
    ("needs_review", "Needs Review"),
    ("adjusted", "Adjusted"),
    ("closed", "Closed"),
]


def fingerprint_for_issue(payload):
    """Stable key so re-imports upsert instead of duplicating open rows."""
    parts = [
        str(payload.get("stand") or payload.get("stand_number") or "").strip().upper(),
        str(payload.get("issue") or payload.get("mismatch_type") or "").strip(),
        str(payload.get("field") or payload.get("field_name") or "").strip(),
        str(payload.get("source_a") or "").strip(),
        str(payload.get("value_a") or "").strip(),
        str(payload.get("source_b") or "").strip(),
        str(payload.get("value_b") or "").strip(),
        str(payload.get("source_c") or "").strip(),
        str(payload.get("value_c") or "").strip(),
    ]
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


class DailyReconciliationException(models.Model):
    _name = "daily.reconciliation.exception"
    _description = "Daily Reconciliation Exception"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "first_seen asc, id asc"
    _rec_name = "display_name"

    name = fields.Char(string="Reference", copy=False, default=lambda self: _("New"), tracking=True)
    display_name = fields.Char(compute="_compute_display_name", store=True)

    fingerprint = fields.Char(string="Fingerprint", index=True, copy=False, required=True)
    reconcile_date = fields.Date(
        string="Reconcile day",
        required=True,
        index=True,
        default=fields.Date.context_today,
        help="Calendar day of the three-way reconcile run that produced this row.",
    )
    first_seen = fields.Datetime(
        string="First seen",
        required=True,
        index=True,
        default=fields.Datetime.now,
        tracking=True,
    )
    last_seen = fields.Datetime(string="Last seen", default=fields.Datetime.now)
    age_days = fields.Integer(string="Age (days)", compute="_compute_age_days", store=True)

    stand_number = fields.Char(string="Stand", required=True, index=True, tracking=True)
    partner_name = fields.Char(string="Customer")
    contract_id = fields.Many2one(
        "lakecity.loan.contract",
        string="Loan contract",
        index=True,
        ondelete="set null",
    )
    contract_external_uid = fields.Char(string="Contract external UID")

    mismatch_type = fields.Selection(MISMATCH_TYPES, string="Mismatch type", required=True, index=True, tracking=True)
    severity = fields.Selection(SEVERITIES, string="Severity", required=True, default="medium", index=True, tracking=True)
    field_name = fields.Char(string="Compared field")

    # Collection Schedule side
    collection_label = fields.Char(string="Collection label", help="source_a from reconcile report")
    collection_value = fields.Char(string="Collection value", help="value_a from reconcile report")
    collection_date = fields.Char(string="Collection date (raw)")
    collection_amount = fields.Float(string="Collection amount", digits=(16, 2))

    # Bank / Odoo side
    odoo_label = fields.Char(string="Bank/Odoo label", help="source_b from reconcile report")
    odoo_value = fields.Char(string="Bank/Odoo value", help="value_b from reconcile report")
    odoo_date = fields.Char(string="Bank/Odoo date (raw)")
    odoo_amount = fields.Float(string="Bank/Odoo amount", digits=(16, 2))

    # Optional third column (expected account, amount, etc.)
    expected_label = fields.Char(string="Expected label", help="source_c from reconcile report")
    expected_value = fields.Char(string="Expected value", help="value_c from reconcile report")

    difference_summary = fields.Text(string="What differs", tracking=True)
    hint = fields.Text(string="Operator hint")

    state = fields.Selection(STATES, string="State", default="open", required=True, index=True, tracking=True)
    action_ids = fields.One2many(
        "daily.reconciliation.action",
        "exception_id",
        string="Action history",
    )
    action_count = fields.Integer(compute="_compute_action_count")

    company_id = fields.Many2one(
        "res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    currency_id = fields.Many2one(
        related="company_id.currency_id",
        store=True,
        readonly=True,
    )
    raw_payload = fields.Text(string="Raw issue JSON", help="Original reconcile row for audit.")

    queue_is_all_clear = fields.Boolean(
        string="Queue all clear (today)",
        compute="_compute_queue_is_all_clear",
    )

    _daily_reconciliation_fingerprint_uniq = models.Constraint(
        "unique(fingerprint)",
        "This reconcile fingerprint is already in the queue.",
    )

    @api.depends("stand_number", "mismatch_type", "name")
    def _compute_display_name(self):
        labels = dict(MISMATCH_TYPES)
        for rec in self:
            tip = labels.get(rec.mismatch_type) or rec.mismatch_type or _("Exception")
            rec.display_name = "%s — Stand %s (%s)" % (rec.name or _("New"), rec.stand_number or "?", tip)

    @api.depends("first_seen")
    def _compute_age_days(self):
        now = fields.Datetime.now()
        for rec in self:
            if not rec.first_seen:
                rec.age_days = 0
                continue
            delta = now - fields.Datetime.to_datetime(rec.first_seen)
            rec.age_days = max(0, delta.days)

    @api.depends("action_ids")
    def _compute_action_count(self):
        for rec in self:
            rec.action_count = len(rec.action_ids)

    @api.depends_context("uid")
    def _compute_queue_is_all_clear(self):
        today = fields.Date.context_today(self)
        open_today = self.search_count([("state", "=", "open"), ("reconcile_date", "=", today)])
        for rec in self:
            rec.queue_is_all_clear = open_today == 0

    @api.model_create_multi
    def create(self, vals_list):
        seq = self.env["ir.sequence"].sudo()
        for vals in vals_list:
            if vals.get("name", _("New")) in (False, _("New"), "New"):
                vals["name"] = seq.next_by_code("daily.reconciliation.exception") or _("DRE")
            if not vals.get("fingerprint"):
                vals["fingerprint"] = fingerprint_for_issue(vals)
            if not vals.get("difference_summary"):
                vals["difference_summary"] = self._default_difference_summary(vals)
        return super().create(vals_list)

    @api.model
    def _default_difference_summary(self, vals):
        tip = dict(MISMATCH_TYPES).get(vals.get("mismatch_type"), vals.get("mismatch_type") or "")
        left = vals.get("collection_value") or ""
        right = vals.get("odoo_value") or ""
        hint = vals.get("hint") or ""
        bits = [tip]
        if left or right:
            bits.append(_("Collection: %s | Bank/Odoo: %s") % (left or "—", right or "—"))
        if hint:
            bits.append(hint)
        return "\n".join(bits)

    def _log_action(self, action_type, note=None):
        Action = self.env["daily.reconciliation.action"]
        for rec in self:
            Action.create(
                {
                    "exception_id": rec.id,
                    "action_type": action_type,
                    "note": note or "",
                    "user_id": self.env.user.id,
                }
            )
            rec.message_post(
                body=_("Action: %s%s")
                % (action_type, (" — %s" % note) if note else ""),
            )

    def action_match(self):
        """One-click: treat sides as matched / accepted."""
        for rec in self:
            if rec.state in ("closed",):
                continue
            rec.write({"state": "matched"})
            rec._log_action("match", _("Marked matched — sides accepted as aligned."))
        return True

    def action_adjust_date(self):
        """One-click: flag that the date was (or will be) adjusted."""
        for rec in self:
            if rec.state in ("closed",):
                continue
            rec.write({"state": "adjusted"})
            rec._log_action(
                "adjust_date",
                _("Date adjustment recorded — re-post with day-first (dd/MM) date, then re-import."),
            )
        return True

    def action_needs_review(self):
        """One-click: push to Needs Review bucket."""
        for rec in self:
            if rec.state in ("closed",):
                continue
            rec.write({"state": "needs_review"})
            rec._log_action("needs_review", _("Moved to Needs Review."))
        return True

    def action_close(self):
        for rec in self:
            rec.write({"state": "closed"})
            rec._log_action("close", _("Closed."))
        return True

    def action_reopen(self):
        for rec in self:
            rec.write({"state": "open"})
            rec._log_action("reopen", _("Reopened."))
        return True

    @api.model
    def open_queue_count_today(self):
        today = fields.Date.context_today(self)
        return self.search_count([("state", "=", "open"), ("reconcile_date", "=", today)])

    @api.model
    def is_all_clear_today(self):
        return self.open_queue_count_today() == 0

    @api.model
    def upsert_from_reconcile_rows(self, rows, reconcile_date=None, company=None):
        """Ingest issue dicts from the three-way reconcile CSV/JSON.

        Expected keys (script CSV headers): severity, stand, field, issue,
        source_a, value_a, source_b, value_b, source_c, value_c, hint.
        """
        if reconcile_date is None:
            reconcile_date = fields.Date.context_today(self)
        company = company or self.env.company
        Contract = self.env["lakecity.loan.contract"].sudo()
        known = {k for k, _ in MISMATCH_TYPES}
        created = updated = skipped = 0
        now = fields.Datetime.now()
        for raw in rows or []:
            if not isinstance(raw, dict):
                skipped += 1
                continue
            stand = str(raw.get("stand") or raw.get("stand_number") or "").strip().upper()
            issue = str(raw.get("issue") or raw.get("mismatch_type") or "").strip()
            if not stand or not issue:
                skipped += 1
                continue
            mismatch = issue if issue in known else "other"
            severity = str(raw.get("severity") or "medium").strip().lower()
            if severity not in dict(SEVERITIES):
                severity = "medium"
            fp = raw.get("fingerprint") or fingerprint_for_issue(
                {
                    "stand": stand,
                    "issue": mismatch if mismatch != "other" else issue,
                    "field": raw.get("field") or raw.get("field_name"),
                    "source_a": raw.get("source_a"),
                    "value_a": raw.get("value_a"),
                    "source_b": raw.get("source_b"),
                    "value_b": raw.get("value_b"),
                    "source_c": raw.get("source_c"),
                    "value_c": raw.get("value_c"),
                }
            )
            contract = Contract.search([("stand_number", "=", stand)], limit=1)
            vals = {
                "fingerprint": fp,
                "reconcile_date": reconcile_date,
                "last_seen": now,
                "stand_number": stand,
                "partner_name": raw.get("partner_name")
                or (contract.partner_id.name if contract else False),
                "contract_id": contract.id if contract else False,
                "contract_external_uid": contract.external_uid if contract else False,
                "mismatch_type": mismatch,
                "severity": severity,
                "field_name": raw.get("field") or raw.get("field_name") or False,
                "collection_label": raw.get("source_a") or False,
                "collection_value": "" if raw.get("value_a") is None else str(raw.get("value_a")),
                "odoo_label": raw.get("source_b") or False,
                "odoo_value": "" if raw.get("value_b") is None else str(raw.get("value_b")),
                "expected_label": raw.get("source_c") or False,
                "expected_value": "" if raw.get("value_c") is None else str(raw.get("value_c")),
                "hint": raw.get("hint") or False,
                "company_id": company.id,
                "raw_payload": str(raw),
            }
            # Best-effort split date/amount from value strings like "2026-01-05 1500"
            vals.update(self._parse_side_values(vals["collection_value"], "collection"))
            vals.update(self._parse_side_values(vals["odoo_value"], "odoo"))
            vals["difference_summary"] = self._default_difference_summary(vals)

            existing = self.search([("fingerprint", "=", fp)], limit=1)
            if existing:
                # Do not reopen matched/closed unless still open or needs_review
                write_vals = {k: v for k, v in vals.items() if k != "fingerprint"}
                if existing.state in ("matched", "closed", "adjusted"):
                    write_vals.pop("state", None)
                else:
                    write_vals.setdefault("state", "open")
                existing.write(write_vals)
                updated += 1
            else:
                vals["first_seen"] = now
                vals["state"] = "open"
                self.create(vals)
                created += 1
        return {"created": created, "updated": updated, "skipped": skipped}

    @api.model
    def _parse_side_values(self, value_str, prefix):
        """Pull a date-like token and a trailing number from a side value string."""
        out = {}
        text = (value_str or "").strip()
        if not text:
            return out
        parts = text.replace("|", " ").split()
        date_token = None
        amount = None
        for p in parts:
            if len(p) >= 8 and (p[4:5] == "-" or p[2:3] == "/"):
                date_token = p
            try:
                cleaned = p.replace(",", "").replace("$", "")
                if cleaned and cleaned.replace(".", "", 1).replace("-", "", 1).isdigit():
                    amount = float(cleaned)
            except Exception:
                pass
        if date_token:
            out["%s_date" % prefix] = date_token
        if amount is not None:
            out["%s_amount" % prefix] = amount
        return out

    @api.model
    def action_open_queue(self):
        """Window action helper: prefer open items, oldest first."""
        return {
            "type": "ir.actions.act_window",
            "name": _("Exception Queue"),
            "res_model": "daily.reconciliation.exception",
            "view_mode": "list,kanban,form",
            "domain": [("state", "in", ["open", "needs_review"])],
            "context": {
                "search_default_open": 1,
                "default_reconcile_date": fields.Date.context_today(self),
            },
        }
