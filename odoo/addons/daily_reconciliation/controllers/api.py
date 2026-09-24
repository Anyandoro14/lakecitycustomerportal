# -*- coding: utf-8 -*-
"""HTTP ingest for three-way reconcile issue rows into the Daily Reconciliation queue.

Reuses the same Bearer token as lakecity_loan_management loan API
(`lakecity_loan.api_token`). Does not reimplement the compare engine — ops run
scripts/daily-bnpl-three-way-reconcile.mjs then POST the CSV/JSON issue list
here (or use the Import wizard in the UI).
"""
import json

from odoo import fields, http
from odoo.http import request


class DailyReconciliationAPI(http.Controller):
    def _json_response(self, payload, status=200):
        return request.make_response(
            json.dumps(payload, default=str),
            headers=[("Content-Type", "application/json")],
            status=status,
        )

    def _validate_token(self):
        """Same Bearer token as lakecity_loan_management (`lakecity_loan.api_token`)."""
        auth = request.httprequest.headers.get("Authorization") or ""
        token = ""
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        if not token:
            token = (request.params.get("token") or "").strip()
        expected = (
            request.env["ir.config_parameter"]
            .sudo()
            .get_param("lakecity_loan.api_token", default="")
            or ""
        ).strip()
        if not expected:
            return False, self._json_response(
                {"ok": False, "error": "API token not configured in lakecity_loan.api_token"},
                status=500,
            )
        if not token or token != expected:
            return False, self._json_response({"ok": False, "error": "Unauthorized"}, status=401)
        return True, None

    @http.route(
        "/lakecity/api/v1/daily-reconciliation/ingest",
        type="http",
        auth="public",
        methods=["POST"],
        csrf=False,
    )
    def ingest_issues(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response
        try:
            body = request.httprequest.get_data(as_text=True) or "{}"
            data = json.loads(body)
        except Exception as exc:
            return self._json_response({"ok": False, "error": "Invalid JSON: %s" % exc}, status=400)

        if isinstance(data, list):
            rows = data
            reconcile_date = fields.Date.context_today(request.env.user)
        else:
            rows = data.get("issues") or data.get("rows") or []
            reconcile_date = data.get("reconcile_date") or fields.Date.context_today(request.env.user)

        ExceptionModel = request.env["daily.reconciliation.exception"].sudo()
        stats = ExceptionModel.upsert_from_reconcile_rows(rows, reconcile_date=reconcile_date)
        open_count = ExceptionModel.search_count(
            [("state", "=", "open"), ("reconcile_date", "=", reconcile_date)]
        )
        return self._json_response(
            {
                "ok": True,
                "reconcile_date": fields.Date.to_string(reconcile_date)
                if hasattr(reconcile_date, "isoformat")
                else str(reconcile_date),
                "stats": stats,
                "open_count": open_count,
                "all_clear": open_count == 0,
            }
        )

    @http.route(
        "/lakecity/api/v1/daily-reconciliation/status",
        type="http",
        auth="public",
        methods=["GET"],
        csrf=False,
    )
    def queue_status(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response
        ExceptionModel = request.env["daily.reconciliation.exception"].sudo()
        today = fields.Date.context_today(request.env.user)
        open_count = ExceptionModel.search_count([("state", "=", "open"), ("reconcile_date", "=", today)])
        needs_review = ExceptionModel.search_count(
            [("state", "=", "needs_review"), ("reconcile_date", "=", today)]
        )
        return self._json_response(
            {
                "ok": True,
                "reconcile_date": fields.Date.to_string(today),
                "open_count": open_count,
                "needs_review_count": needs_review,
                "all_clear": open_count == 0,
            }
        )
