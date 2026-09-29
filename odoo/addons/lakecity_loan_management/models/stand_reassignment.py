# -*- coding: utf-8 -*-
"""Stand reassignment / client cancel with initiator–authorizer approval stub."""
from odoo import _, api, fields, models
from odoo.exceptions import UserError


class LakecityStandReassignment(models.Model):
    _name = "lakecity.stand.reassignment"
    _description = "Stand reassignment / client cancel request"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "create_date desc, id desc"

    name = fields.Char(compute="_compute_name", store=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    stand_number = fields.Char(required=True, index=True)
    outgoing_contract_id = fields.Many2one(
        "lakecity.loan.contract",
        string="Departing contract",
        required=True,
    )
    outgoing_partner_id = fields.Many2one(
        related="outgoing_contract_id.partner_id",
        string="Departing client",
        store=True,
    )
    incoming_partner_id = fields.Many2one(
        "res.partner",
        string="Replacement client",
        help="New customer for the same stand. Required to complete reassignment.",
    )
    incoming_contract_id = fields.Many2one(
        "lakecity.loan.contract",
        string="Replacement contract",
        readonly=True,
        copy=False,
    )
    reason = fields.Text(required=True)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("pending_approval", "Pending authorizer"),
            ("approved", "Approved"),
            ("done", "Done"),
            ("rejected", "Rejected"),
            ("cancelled", "Cancelled"),
        ],
        default="draft",
        required=True,
        tracking=True,
    )
    initiator_id = fields.Many2one(
        "res.users",
        string="Initiator",
        default=lambda self: self.env.user,
        required=True,
        tracking=True,
    )
    authorizer_id = fields.Many2one(
        "res.users",
        string="Authorizer",
        tracking=True,
        help="Must differ from initiator (initiator–authorizer control).",
    )
    approved_at = fields.Datetime(readonly=True)
    close_outgoing_as = fields.Selection(
        [
            ("closed", "Close contract (creditor / clean exit)"),
            ("defaulted", "Mark defaulted"),
            ("cancel_refund", "Cancel with refund accounting"),
        ],
        default="closed",
        required=True,
        help="Departing client: close AR path; replacement starts clean on new/updated contract.",
    )
    portal_sync_note = fields.Text(
        readonly=True,
        help="Notes about portal deactivation / stand sync after apply.",
    )

    @api.depends("stand_number", "outgoing_partner_id", "state")
    def _compute_name(self):
        for rec in self:
            rec.name = _("Stand %s reassignment (%s)") % (
                rec.stand_number or "?",
                rec.state or "draft",
            )

    def action_submit_for_approval(self):
        for rec in self:
            if rec.state != "draft":
                raise UserError(_("Only draft requests can be submitted."))
            if not rec.reason or not rec.reason.strip():
                raise UserError(_("Enter a reason before submitting."))
            rec.state = "pending_approval"
        return True

    def action_approve(self):
        for rec in self:
            if rec.state != "pending_approval":
                raise UserError(_("Only pending requests can be approved."))
            if rec.authorizer_id and rec.authorizer_id == rec.initiator_id:
                raise UserError(
                    _("Authorizer must differ from initiator (dual-control).")
                )
            if not rec.authorizer_id:
                rec.authorizer_id = self.env.user
            if rec.authorizer_id == rec.initiator_id:
                raise UserError(
                    _("Authorizer must differ from initiator (dual-control).")
                )
            rec.write(
                {
                    "state": "approved",
                    "approved_at": fields.Datetime.now(),
                    "authorizer_id": rec.authorizer_id.id,
                }
            )
        return True

    def action_reject(self):
        for rec in self:
            if rec.state not in ("draft", "pending_approval"):
                raise UserError(_("Only draft/pending requests can be rejected."))
            rec.state = "rejected"
        return True

    def action_apply(self):
        """Close outgoing contract and optionally create/link replacement on same stand."""
        Contract = self.env["lakecity.loan.contract"].sudo()
        for rec in self:
            if rec.state != "approved":
                raise UserError(_("Approve before applying."))
            contract = rec.outgoing_contract_id
            stand = Contract._lakecity_normalize_stand(rec.stand_number)
            if contract.stand_number != stand:
                raise UserError(
                    _("Outgoing contract stand %s does not match request stand %s.")
                    % (contract.stand_number, stand)
                )

            if rec.close_outgoing_as == "cancel_refund" and hasattr(
                contract, "action_cancel_with_refund"
            ):
                contract.action_cancel_with_refund()
            elif rec.close_outgoing_as == "defaulted":
                if hasattr(contract, "action_mark_defaulted"):
                    contract.action_mark_defaulted()
                else:
                    contract.write({"state": "defaulted"})
            else:
                if hasattr(contract, "action_close"):
                    contract.action_close()
                else:
                    contract.write({"state": "closed"})

            # Free stand uniqueness for replacement: archive stand on closed contract.
            archive_stand = "%s-X%s" % (stand, contract.id)
            contract.write({"stand_number": archive_stand})
            contract.message_post(
                body=_("Stand reassigned away; original stand was %s (request %s).")
                % (stand, rec.display_name)
            )

            new_contract = False
            if rec.incoming_partner_id:
                existing = Contract.search(
                    [("stand_number", "=", stand), ("state", "in", ("draft", "active"))],
                    limit=1,
                )
                if existing:
                    new_contract = existing
                    if existing.partner_id != rec.incoming_partner_id:
                        existing.write({"partner_id": rec.incoming_partner_id.id})
                else:
                    vals = {
                        "stand_number": stand,
                        "partner_id": rec.incoming_partner_id.id,
                        "state": "draft",
                    }
                    # Copy product/terms when available
                    for fname in ("product_id", "currency_id", "term_months", "due_day", "tax_rate"):
                        if fname in contract._fields and contract[fname]:
                            vals[fname] = (
                                contract[fname].id
                                if hasattr(contract[fname], "id")
                                else contract[fname]
                            )
                    new_contract = Contract.create(vals)

            portal_note = _(
                "Outgoing portal user for stand %s must be deactivated; replacement enrolled. "
                "Sync Odoo ↔ portal stand_number / partner. Initiator=%s Authorizer=%s."
            ) % (
                stand,
                rec.initiator_id.display_name,
                rec.authorizer_id.display_name if rec.authorizer_id else "—",
            )
            rec.write(
                {
                    "state": "done",
                    "incoming_contract_id": new_contract.id if new_contract else False,
                    "portal_sync_note": portal_note,
                }
            )
        return True
