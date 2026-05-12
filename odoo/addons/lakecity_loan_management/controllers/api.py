# -*- coding: utf-8 -*-
import json

from odoo import fields, http
from odoo.http import request


class LakecityLoanApiController(http.Controller):
    def _json_response(self, payload, status=200):
        return request.make_response(
            json.dumps(payload, default=str),
            headers=[("Content-Type", "application/json")],
            status=status,
        )

    def _get_bearer_token(self):
        auth_header = request.httprequest.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return ""
        return auth_header.replace("Bearer ", "").strip()

    def _validate_token(self):
        supplied = self._get_bearer_token()
        expected = request.env["ir.config_parameter"].sudo().get_param("lakecity_loan.api_token", default="")
        if not expected:
            return False, self._json_response(
                {"ok": False, "error": "API token not configured in lakecity_loan.api_token"},
                status=500,
            )
        if not supplied or supplied != expected:
            return False, self._json_response({"ok": False, "error": "Unauthorized"}, status=401)
        return True, None

    def _parse_json_body(self):
        raw = request.httprequest.data.decode("utf-8") if request.httprequest.data else "{}"
        try:
            return json.loads(raw or "{}")
        except Exception:
            return {}

    def _upsert_partner(self, payload):
        Partner = request.env["res.partner"].sudo()
        email = (payload.get("email") or "").strip().lower()
        phone = (payload.get("phone") or "").strip()
        name = (payload.get("name") or "").strip() or "Lakecity Customer"

        partner = False
        if email:
            partner = Partner.search([("email", "=", email)], limit=1)
        if not partner and phone:
            partner = Partner.search([("phone", "=", phone)], limit=1)
        partner_vals = {"name": name, "email": email or False, "phone": phone or False}
        # Sales/Accounting: makes the contact show as a Customer (when module provides the field).
        if "customer_rank" in Partner._fields:
            partner_vals["customer_rank"] = 1

        if not partner:
            partner = Partner.create(partner_vals)
        else:
            updates = {}
            if name and not partner.name:
                updates["name"] = name
            if email and not partner.email:
                updates["email"] = email
            if phone and not partner.phone:
                updates["phone"] = phone
            if "customer_rank" in Partner._fields and not partner.customer_rank:
                updates["customer_rank"] = 1
            if updates:
                partner.write(updates)
        return partner

    def _ensure_lakecity_crm_lead_first(self, external_uid, stand_number, partner_payload):
        """Create or reuse a CRM lead **before** partner/contract when strict CRM-first is requested."""
        Lead = request.env["crm.lead"].sudo()
        existing = Lead.search([("lakecity_contract_external_uid", "=", external_uid)], limit=1)
        if existing:
            return existing

        pname = (partner_payload.get("name") or "").strip() or "Lakecity Customer"
        team = request.env["crm.team"].sudo().search([], order="sequence,id", limit=1)

        vals = {
            "name": "Stand %s — %s" % (stand_number, pname),
            "contact_name": pname,
            "email_from": (partner_payload.get("email") or "").strip() or False,
            "phone": (partner_payload.get("phone") or "").strip() or False,
            "type": "opportunity",
            "description": (
                "LakeCity BNPL import (CRM-first).\n"
                "Contract external_uid: %s\nStand: %s\n" % (external_uid, stand_number)
            ),
            "lakecity_contract_external_uid": external_uid,
            "lakecity_stand_number": stand_number,
        }
        if team:
            vals["team_id"] = team.id
        return Lead.create(vals)

    def _contract_payload(self, contract):
        installments = contract.installment_ids.sorted(key=lambda l: (l.due_date or fields.Date.today(), l.sequence))
        return {
            "id": contract.id,
            "name": contract.name,
            "external_uid": contract.external_uid,
            "partner_id": contract.partner_id.id,
            "partner_name": contract.partner_id.name,
            "stand_number": contract.stand_number,
            "state": contract.state,
            "term_months": contract.term_months,
            "due_day": contract.due_day,
            "payment_start_date": contract.payment_start_date,
            "total_price": contract.total_price,
            "deposit_amount": contract.deposit_amount,
            "total_with_tax": contract.total_with_tax,
            "recurring_invoice_amount": contract.recurring_invoice_amount,
            "total_paid": contract.total_paid,
            "current_balance": contract.current_balance,
            "accrued_amount": contract.accrued_amount,
            "current_due_amount": contract.current_due_amount,
            "next_payment_due_amount": contract.next_payment_due_amount,
            "next_payment_date": contract.next_payment_date,
            "days_overdue": contract.days_overdue,
            "installments_count": len(installments),
            "open_installments_count": len(installments.filtered(lambda l: l.amount_outstanding > 0)),
        }

    @http.route("/lakecity/api/v1/health", type="http", auth="public", methods=["GET"], csrf=False)
    def health(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response
        return self._json_response({"ok": True, "service": "lakecity_loan_management", "version": "v1"})

    @http.route("/lakecity/api/v1/loan/upsert", type="http", auth="public", methods=["POST"], csrf=False)
    def upsert_loan(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response

        payload = self._parse_json_body()
        external_uid = (payload.get("external_uid") or "").strip()
        stand_number = (payload.get("stand_number") or "").strip().upper()
        partner_payload = payload.get("partner") or {}

        if not external_uid or not stand_number:
            return self._json_response(
                {"ok": False, "error": "external_uid and stand_number are required"},
                status=400,
            )

        create_crm_first = bool(payload.get("create_crm_lead_first"))
        crm_lead = request.env["crm.lead"]
        if create_crm_first:
            crm_lead = self._ensure_lakecity_crm_lead_first(external_uid, stand_number, partner_payload)

        partner = self._upsert_partner(partner_payload)

        if create_crm_first and crm_lead:
            crm_lead.write({"partner_id": partner.id})

        Contract = request.env["lakecity.loan.contract"].sudo()
        contract = Contract.search([("external_uid", "=", external_uid)], limit=1)

        vals = {
            "external_uid": external_uid,
            "partner_id": partner.id,
            "stand_number": stand_number,
            "product_id": payload.get("product_id") or False,
            "term_months": int(payload.get("term_months") or 36),
            "due_day": int(payload.get("due_day") or 5),
            "payment_start_date": payload.get("payment_start_date") or fields.Date.today(),
            "total_price": float(payload.get("total_price") or 0.0),
            "deposit_amount": float(payload.get("deposit_amount") or 0.0),
            "tax_rate": float(payload.get("tax_rate") or 0.0),
            "is_vat_inclusive": bool(payload.get("is_vat_inclusive", True)),
            "agreement_signed_seller": bool(payload.get("agreement_signed_seller", False)),
            "agreement_signed_buyer": bool(payload.get("agreement_signed_buyer", False)),
            "agreement_file_url": payload.get("agreement_file_url") or False,
            "state": payload.get("state") or "draft",
        }

        if contract:
            contract.write(vals)
        else:
            contract = Contract.create(vals)

        if bool(payload.get("generate_schedule", False)):
            contract.action_generate_schedule()
        if bool(payload.get("activate", False)) and contract.state == "draft":
            contract.action_activate()

        out = {"ok": True, "contract": self._contract_payload(contract)}
        if create_crm_first and crm_lead:
            out["crm_lead_id"] = crm_lead.id
        return self._json_response(out)

    @http.route("/lakecity/api/v1/loan/get", type="http", auth="public", methods=["GET"], csrf=False)
    def get_loan(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response

        external_uid = (kwargs.get("external_uid") or "").strip()
        stand_number = (kwargs.get("stand_number") or "").strip().upper()

        Contract = request.env["lakecity.loan.contract"].sudo()
        domain = []
        if external_uid:
            domain = [("external_uid", "=", external_uid)]
        elif stand_number:
            domain = [("stand_number", "=", stand_number)]
        else:
            return self._json_response(
                {"ok": False, "error": "Provide external_uid or stand_number"},
                status=400,
            )

        contract = Contract.search(domain, limit=1)
        if not contract:
            return self._json_response({"ok": False, "error": "Contract not found"}, status=404)

        return self._json_response({"ok": True, "contract": self._contract_payload(contract)})

    @http.route("/lakecity/api/v1/loan/installments", type="http", auth="public", methods=["GET"], csrf=False)
    def get_installments(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response

        external_uid = (kwargs.get("external_uid") or "").strip()
        Contract = request.env["lakecity.loan.contract"].sudo()
        contract = Contract.search([("external_uid", "=", external_uid)], limit=1)
        if not contract:
            return self._json_response({"ok": False, "error": "Contract not found"}, status=404)

        rows = []
        for line in contract.installment_ids.sorted(key=lambda l: (l.due_date or fields.Date.today(), l.sequence)):
            rows.append(
                {
                    "id": line.id,
                    "sequence": line.sequence,
                    "due_date": line.due_date,
                    "amount_due": line.amount_due,
                    "amount_paid": line.amount_paid,
                    "amount_outstanding": line.amount_outstanding,
                    "state": line.state,
                }
            )
        return self._json_response({"ok": True, "contract_external_uid": external_uid, "installments": rows})

    @http.route("/lakecity/api/v1/payment/post", type="http", auth="public", methods=["POST"], csrf=False)
    def post_payment(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response

        payload = self._parse_json_body()
        external_uid = (payload.get("external_uid") or "").strip()
        contract_external_uid = (payload.get("contract_external_uid") or "").strip()
        amount = float(payload.get("amount") or 0.0)

        if not external_uid or not contract_external_uid or amount <= 0:
            return self._json_response(
                {"ok": False, "error": "external_uid, contract_external_uid and positive amount are required"},
                status=400,
            )

        Contract = request.env["lakecity.loan.contract"].sudo()
        Payment = request.env["lakecity.loan.payment"].sudo()
        contract = Contract.search([("external_uid", "=", contract_external_uid)], limit=1)
        if not contract:
            return self._json_response({"ok": False, "error": "Contract not found"}, status=404)

        payment = Payment.search([("external_uid", "=", external_uid)], limit=1)
        vals = {
            "external_uid": external_uid,
            "contract_id": contract.id,
            "payment_date": payload.get("payment_date") or fields.Date.today(),
            "amount": amount,
            "source": payload.get("source") or "manual",
            "reference": payload.get("reference") or False,
            "note": payload.get("note") or False,
            "state": payload.get("state") or "posted",
        }
        if payment:
            payment.write(vals)
        else:
            payment = Payment.create(vals)

        contract._rebuild_payment_allocations()
        return self._json_response(
            {"ok": True, "payment_id": payment.id, "payment_name": payment.name, "contract": self._contract_payload(contract)}
        )

    @http.route("/lakecity/api/v1/loan/status", type="http", auth="public", methods=["POST"], csrf=False)
    def set_status(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response

        payload = self._parse_json_body()
        external_uid = (payload.get("external_uid") or "").strip()
        status = (payload.get("status") or "").strip()
        if not external_uid or status not in {"draft", "active", "closed", "defaulted"}:
            return self._json_response({"ok": False, "error": "external_uid and valid status required"}, status=400)

        contract = request.env["lakecity.loan.contract"].sudo().search([("external_uid", "=", external_uid)], limit=1)
        if not contract:
            return self._json_response({"ok": False, "error": "Contract not found"}, status=404)

        contract.write({"state": status})
        if status == "active" and not contract.installment_ids:
            contract.action_generate_schedule()
        return self._json_response({"ok": True, "contract": self._contract_payload(contract)})
