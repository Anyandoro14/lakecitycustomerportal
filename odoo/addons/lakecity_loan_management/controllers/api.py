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

    def _lakecity_receipt_pick(self, payload, answers, keys):
        """First non-empty match from payload dict then answers dict."""
        for key in keys:
            val = payload.get(key)
            if val not in (None, "", False):
                return val
            if isinstance(answers, dict):
                aval = answers.get(key)
                if aval not in (None, "", False):
                    return aval
        return ""

    def _lakecity_parse_amount(self, raw):
        try:
            return float(raw)
        except (TypeError, ValueError):
            return 0.0

    def _lakecity_parse_payment_date(self, raw):
        if not raw:
            return False
        try:
            return fields.Date.to_date(fields.Datetime.to_datetime(raw))
        except Exception:
            pass
        try:
            return fields.Date.from_string(str(raw)[:10])
        except Exception:
            return False

    def _lakecity_parse_received_ts(self, raw):
        if not raw:
            return fields.Datetime.now()
        try:
            return fields.Datetime.to_datetime(raw)
        except Exception:
            return fields.Datetime.now()

    def _flatten_receipt_intake_payload(self, payload):
        answers = payload.get("answers") if isinstance(payload.get("answers"), dict) else {}
        uid = str(self._lakecity_receipt_pick(payload, answers, "uuid", "intake_uuid", "Intake_ID") or "").strip()
        stand_raw = str(self._lakecity_receipt_pick(payload, answers, "stand_number", "Stand_Number", "Stand Number") or "").strip()
        stand = request.env["lakecity.loan.contract"].sudo()._lakecity_normalize_stand(stand_raw)

        fn = str(self._lakecity_receipt_pick(payload, answers, "first_name", "First Name") or "").strip()
        ln = str(self._lakecity_receipt_pick(payload, answers, "last_name", "Last Name") or "").strip()
        customer_name = str(self._lakecity_receipt_pick(payload, answers, "customer_name", "Customer_Name", "Customer Name", "payer_name", "Payer Name", "Full Name", "Name") or "").strip()
        if not customer_name:
            customer_name = ("%s %s" % (fn, ln)).strip()

        amt_raw = self._lakecity_receipt_pick(payload, answers, "amount", "Payment_Amount", "Amount")
        payment_method = str(
            self._lakecity_receipt_pick(
                payload,
                answers,
                "payment_method",
                "Payment_Method",
                "Payment Method",
            )
            or ""
        ).strip()
        receipt_url = str(
            self._lakecity_receipt_pick(
                payload,
                answers,
                "receipt_url",
                "Receipt_URL",
                "Receipt",
                "receipt_link",
                "Receipt Link",
                "Link to receipt",
                "Receipt URL",
            )
            or ""
        ).strip()
        reference = str(self._lakecity_receipt_pick(payload, answers, "reference", "Reference") or "").strip()
        entered_by = str(self._lakecity_receipt_pick(payload, answers, "entered_by", "Entered_By", "Receipt Entered by") or "").strip()
        ts_raw = self._lakecity_receipt_pick(payload, answers, "timestamp", "Timestamp")
        pay_date_raw = self._lakecity_receipt_pick(payload, answers, "payment_date", "Payment_Date", "Receipt Date")

        return {
            "intake_uuid": uid,
            "stand_number": stand,
            "customer_name": customer_name or False,
            "payment_amount": self._lakecity_parse_amount(amt_raw),
            "payment_method_raw": payment_method or False,
            "receipt_url": receipt_url or False,
            "reference": reference or False,
            "entered_by": entered_by or False,
            "timestamp_received": self._lakecity_parse_received_ts(ts_raw),
            "payment_date": self._lakecity_parse_payment_date(pay_date_raw),
        }

    @http.route("/lakecity/api/v1/receipt/intake", type="http", auth="public", methods=["POST"], csrf=False)
    def receipt_intake(self, **kwargs):
        """Receive receipt submissions from Make.com (QC happens inside Odoo)."""
        ok, response = self._validate_token()
        if not ok:
            return response

        payload = self._parse_json_body()
        flat = self._flatten_receipt_intake_payload(payload)

        if not flat["intake_uuid"]:
            return self._json_response({"ok": False, "error": "uuid_required"}, status=400)
        if not flat["stand_number"]:
            return self._json_response({"ok": False, "error": "stand_number_required"}, status=400)
        if flat["payment_amount"] <= 0:
            return self._json_response({"ok": False, "error": "positive_amount_required"}, status=400)
        if not flat["receipt_url"] or not str(flat["receipt_url"]).startswith("https://"):
            return self._json_response({"ok": False, "error": "https_receipt_url_required"}, status=400)

        Intake = request.env["lakecity.receipt.intake"].sudo()
        existing = Intake.search([("intake_uuid", "=", flat["intake_uuid"])], limit=1)
        vals = {
            "intake_uuid": flat["intake_uuid"],
            "timestamp_received": flat["timestamp_received"],
            "stand_number": flat["stand_number"],
            "customer_name": flat["customer_name"],
            "payment_date": flat["payment_date"],
            "payment_amount": flat["payment_amount"],
            "currency_id": request.env.company.currency_id.id,
            "payment_method_raw": flat["payment_method_raw"],
            "reference": flat["reference"],
            "receipt_url": flat["receipt_url"],
            "entered_by": flat["entered_by"],
            "state": "pending_qc",
        }
        if existing:
            if existing.state != "pending_qc":
                return self._json_response(
                    {
                        "ok": False,
                        "error": "intake_already_processed",
                        "state": existing.state,
                        "intake_id": existing.id,
                    },
                    status=409,
                )
            existing.write(vals)
            record = existing
        else:
            record = Intake.create(vals)

        return self._json_response(
            {
                "ok": True,
                "intake_id": record.id,
                "state": record.state,
                "stand_number": record.stand_number,
                "next_step": "Lakecity Loans → Receipt intakes (QC) → approve when validated.",
            }
        )

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

        crm_row = request.env["crm.lead"].sudo().search(
            [("lakecity_contract_external_uid", "=", external_uid)], limit=1
        )
        out = {
            "ok": True,
            "contract": self._contract_payload(contract),
            "stand_number": contract.stand_number,
            "partner_id": partner.id,
        }
        if crm_row:
            out["crm_lead_id"] = crm_row.id
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

    def _lakecity_stand_marketable(self, status):
        """Align with customer portal: sold if 'sold' in status; marketable if blank or exactly 'available'."""
        s = (status or "").strip()
        if "sold" in s.lower():
            return False
        if not s:
            return True
        return s.lower() == "available"

    def _lakecity_default_stock_location(self):
        wh = request.env["stock.warehouse"].sudo().search([("company_id", "=", request.env.company.id)], limit=1)
        return wh.lot_stock_id if wh else False

    def _lakecity_set_variant_stock_qty(self, product_product, location, qty):
        if not product_product:
            return False, "no_product"
        if not location:
            return False, "no_stock_location"
        Quant = request.env["stock.quant"].sudo()
        quant = Quant.search([("product_id", "=", product_product.id), ("location_id", "=", location.id)], limit=1)
        ctx = dict(request.env.context, inventory_mode=True)
        q = float(qty)
        try:
            if quant:
                quant.with_context(**ctx).write({"inventory_quantity": q})
            else:
                Quant.with_context(**ctx).create(
                    {"product_id": product_product.id, "location_id": location.id, "inventory_quantity": q}
                )
        except Exception as err:
            return False, str(err)
        return True, None

    def _lakecity_sync_stand_product_item(self, item):
        stand_number = (item.get("stand_number") or "").strip().upper()
        if not stand_number:
            return {"ok": False, "error": "stand_number_required", "stand_number": stand_number}

        archive = bool(item.get("archive"))
        status = item.get("status")
        marketable = self._lakecity_stand_marketable(status) and not archive

        tmpl = request.env["product.template"].sudo().search([("lakecity_stand_number", "=", stand_number)], limit=1)

        lp = item.get("purchase_price")
        try:
            list_price = float(lp) if lp is not None and lp != "" else 0.0
        except (TypeError, ValueError):
            list_price = 0.0

        name = "Stand %s — Lake City" % stand_number
        desc_lines = []
        if item.get("land_use"):
            desc_lines.append("Land use: %s" % item["land_use"])
        if item.get("phase"):
            desc_lines.append("Phase: %s" % item["phase"])
        if item.get("rights"):
            desc_lines.append("Rights: %s" % item["rights"])
        if item.get("agreement_requested"):
            desc_lines.append("Agreement requested: %s" % item["agreement_requested"])
        if item.get("agreement_signed_warwickshire"):
            desc_lines.append("Agreement signed (Warwickshire): %s" % item["agreement_signed_warwickshire"])
        if item.get("agreement_signed_by_client"):
            desc_lines.append("Agreement signed (client): %s" % item["agreement_signed_by_client"])
        description = "\n".join(desc_lines) if desc_lines else False

        active = not archive
        sale_ok = marketable

        if tmpl:
            write_vals = {
                "name": name,
                "type": "product",
                "sale_ok": sale_ok,
                "purchase_ok": False,
                "list_price": list_price,
                "active": active,
            }
            if description:
                write_vals["description"] = description
            if not tmpl.lakecity_stand_number:
                write_vals["lakecity_stand_number"] = stand_number
            if not tmpl.default_code:
                write_vals["default_code"] = stand_number
            tmpl.write(write_vals)
        else:
            create_vals = {
                "name": name,
                "type": "product",
                "sale_ok": sale_ok,
                "purchase_ok": False,
                "lakecity_stand_number": stand_number,
                "default_code": stand_number,
                "list_price": list_price,
                "active": active,
            }
            if description:
                create_vals["description"] = description
            tmpl = request.env["product.template"].sudo().create(create_vals)

        variant = tmpl.product_variant_ids[:1]
        if not variant:
            return {
                "ok": False,
                "error": "no_product_variant",
                "stand_number": stand_number,
                "product_tmpl_id": tmpl.id,
            }
        product_product = variant[0]
        loc = self._lakecity_default_stock_location()
        target_qty = 1.0 if marketable and not archive else 0.0
        stock_ok, stock_err = self._lakecity_set_variant_stock_qty(product_product, loc, target_qty)

        quants = request.env["stock.quant"].sudo().search([("product_id", "=", product_product.id)])
        free_qty = sum(quants.mapped("quantity"))

        return {
            "ok": True,
            "stand_number": stand_number,
            "product_tmpl_id": tmpl.id,
            "product_id": product_product.id,
            "marketable": marketable,
            "inventory_qty": target_qty,
            "stock_location_applied": bool(loc) and stock_ok,
            "stock_warn": None if stock_ok else stock_err,
            "free_qty": free_qty,
            "no_warehouse": not bool(loc),
        }

    def _stand_item_from_payload(self, payload):
        return {
            "stand_number": payload.get("stand_number"),
            "status": payload.get("status"),
            "purchase_price": payload.get("purchase_price"),
            "land_use": payload.get("land_use"),
            "phase": payload.get("phase"),
            "rights": payload.get("rights"),
            "agreement_requested": payload.get("agreement_requested"),
            "agreement_signed_warwickshire": payload.get("agreement_signed_warwickshire"),
            "agreement_signed_by_client": payload.get("agreement_signed_by_client"),
            "archive": payload.get("archive"),
        }

    @http.route("/lakecity/api/v1/stand/product-sync", type="http", auth="public", methods=["POST"], csrf=False)
    def stand_product_sync(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response
        payload = self._parse_json_body()
        result = self._lakecity_sync_stand_product_item(self._stand_item_from_payload(payload))
        http_status = 200 if result.get("ok") else 400
        return self._json_response(result, status=http_status)

    @http.route("/lakecity/api/v1/stand/product-sync-batch", type="http", auth="public", methods=["POST"], csrf=False)
    def stand_product_sync_batch(self, **kwargs):
        ok, response = self._validate_token()
        if not ok:
            return response
        payload = self._parse_json_body()
        items = payload.get("items")
        if not isinstance(items, list) or len(items) == 0:
            return self._json_response({"ok": False, "error": "items_array_required"}, status=400)
        if len(items) > 500:
            return self._json_response({"ok": False, "error": "max_500_items"}, status=400)
        results = [self._lakecity_sync_stand_product_item(self._stand_item_from_payload(raw)) for raw in items]
        return self._json_response({"ok": True, "count": len(results), "results": results})
