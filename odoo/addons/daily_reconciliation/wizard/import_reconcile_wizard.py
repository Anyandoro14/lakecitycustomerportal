# -*- coding: utf-8 -*-
import base64
import csv
import io
import json

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class DailyReconciliationImportWizard(models.TransientModel):
    _name = "daily.reconciliation.import.wizard"
    _description = "Import today's three-way reconcile into the exception queue"

    reconcile_date = fields.Date(
        string="Reconcile day",
        required=True,
        default=fields.Date.context_today,
    )
    source = fields.Selection(
        [
            ("upload", "Upload CSV / JSON file"),
            ("paste", "Paste JSON"),
            ("sample", "Load sample exceptions"),
        ],
        string="Source",
        default="upload",
        required=True,
    )
    data_file = fields.Binary(string="Reconcile report file")
    filename = fields.Char(string="Filename")
    paste_json = fields.Text(
        string="JSON payload",
        help="Either a list of issue objects, or {\"issues\": [...]} matching the "
        "daily-bnpl-three-way-reconcile.mjs CSV columns.",
    )
    result_message = fields.Text(string="Result", readonly=True)

    def action_import(self):
        self.ensure_one()
        Exception = self.env["daily.reconciliation.exception"]
        if self.source == "sample":
            rows = self._sample_rows()
        elif self.source == "paste":
            rows = self._rows_from_json_text(self.paste_json or "")
        else:
            if not self.data_file:
                raise UserError(_("Upload a CSV or JSON file from the three-way reconcile script."))
            raw = base64.b64decode(self.data_file)
            name = (self.filename or "").lower()
            if name.endswith(".json"):
                rows = self._rows_from_json_text(raw.decode("utf-8"))
            else:
                rows = self._rows_from_csv(raw.decode("utf-8-sig"))
        if not rows:
            raise UserError(_("No issue rows found to import."))
        stats = Exception.upsert_from_reconcile_rows(rows, reconcile_date=self.reconcile_date)
        self.result_message = _(
            "Imported for %(day)s — created %(created)s, updated %(updated)s, skipped %(skipped)s."
        ) % {
            "day": self.reconcile_date,
            "created": stats["created"],
            "updated": stats["updated"],
            "skipped": stats["skipped"],
        }
        return {
            "type": "ir.actions.act_window",
            "name": _("Exception Queue"),
            "res_model": "daily.reconciliation.exception",
            "view_mode": "list,kanban,form",
            "domain": [("reconcile_date", "=", self.reconcile_date)],
            "target": "current",
        }

    @api.model
    def _rows_from_json_text(self, text):
        text = (text or "").strip()
        if not text:
            return []
        data = json.loads(text)
        if isinstance(data, dict):
            if isinstance(data.get("issues"), list):
                return data["issues"]
            if isinstance(data.get("rows"), list):
                return data["rows"]
            # Single issue object
            if data.get("issue") or data.get("mismatch_type"):
                return [data]
            return []
        if isinstance(data, list):
            return data
        return []

    @api.model
    def _rows_from_csv(self, text):
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for row in reader:
            # Normalise keys to script headers
            norm = {str(k or "").strip().lower(): v for k, v in row.items()}
            rows.append(
                {
                    "severity": norm.get("severity"),
                    "stand": norm.get("stand") or norm.get("stand_number"),
                    "field": norm.get("field"),
                    "issue": norm.get("issue") or norm.get("mismatch_type"),
                    "source_a": norm.get("source_a"),
                    "value_a": norm.get("value_a"),
                    "source_b": norm.get("source_b"),
                    "value_b": norm.get("value_b"),
                    "source_c": norm.get("source_c"),
                    "value_c": norm.get("value_c"),
                    "hint": norm.get("hint"),
                    "partner_name": norm.get("partner_name") or norm.get("customer"),
                }
            )
        return rows

    @api.model
    def _sample_rows(self):
        """Seed examples covering the main runbook issue codes."""
        return [
            {
                "severity": "critical",
                "stand": "A12",
                "field": "receipt_debit_account",
                "issue": "pre_cutoff_hit_bank",
                "source_a": "odoo_payment",
                "value_a": "BNPL/2025/0001 2025-12-15 5000",
                "source_b": "debit_accounts",
                "value_b": "101410",
                "source_c": "expected",
                "value_c": "303000",
                "hint": "Re-run cutover with force so opening cash hits Retained Earnings.",
            },
            {
                "severity": "critical",
                "stand": "B7",
                "field": "payment",
                "issue": "missing_receipt_unposted",
                "source_a": "collection",
                "value_a": "2026-03-15 1200",
                "source_b": "odoo",
                "value_b": "not found",
                "hint": "Import post-cutoff sheet payments or post via receipt intake.",
            },
            {
                "severity": "critical",
                "stand": "C3",
                "field": "total_paid",
                "issue": "amount_mismatch",
                "source_a": "collection",
                "value_a": "8500",
                "source_b": "odoo",
                "value_b": "8200",
                "hint": "Fix sheet arithmetic first; then re-import / cutover.",
            },
            {
                "severity": "high",
                "stand": "D1",
                "field": "payment_date",
                "issue": "wrong_date_day_month_swap",
                "source_a": "collection",
                "value_a": "05/01/2026",
                "source_b": "odoo",
                "value_b": "2026-05-01",
                "source_c": "amount",
                "value_c": "900",
                "hint": "Day/month likely swapped — confirm receipt and re-post with dd/MM date.",
            },
            {
                "severity": "high",
                "stand": "E9",
                "field": "contract",
                "issue": "missing_in_odoo",
                "source_a": "collection",
                "value_a": "Jane Doe",
                "hint": "Create/upsert loan contract from Collection Schedule import.",
            },
            {
                "severity": "medium",
                "stand": "F2",
                "field": "start_date",
                "issue": "ambiguous_date_day_month",
                "source_a": "collection",
                "value_a": "05/01/2026",
                "source_b": "parsed_day_first",
                "value_b": "2026-01-05",
                "source_c": "us_alt",
                "value_c": "2026-05-01",
                "hint": "Confirm whether the sheet meant 5 Jan or 1 May.",
            },
        ]
