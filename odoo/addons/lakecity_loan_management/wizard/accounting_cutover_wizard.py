# -*- coding: utf-8 -*-
from odoo import _, fields, models
from odoo.exceptions import UserError

LAKECITY_DEFAULT_ACCOUNTING_START_DATE = "2026-01-01"


class LakecityAccountingCutoverWizard(models.TransientModel):
    _name = "lakecity.accounting.cutover.wizard"
    _description = "Lump pre-start receipts into opening-balance JEs"

    company_id = fields.Many2one(
        "res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
    cutoff_date = fields.Date(
        string="Accounting start date",
        required=True,
        default=lambda self: self.env.company.lakecity_accounting_start_date
        or fields.Date.from_string(LAKECITY_DEFAULT_ACCOUNTING_START_DATE),
        help="Receipts dated before this day are totaled into one opening JE per stand "
        "on this date, then removed. Default is 1 January 2026.",
    )
    stand_number = fields.Char(
        string="Stand number (optional)",
        help="Limit to one stand. Leave empty to process every loan contract.",
    )
    result_message = fields.Text(string="Result", readonly=True)

    def _contracts(self):
        self.ensure_one()
        domain = [("company_id", "=", self.company_id.id)]
        stand = (self.stand_number or "").strip().upper()
        if stand:
            domain.append(("stand_number", "=", stand))
        return self.env["lakecity.loan.contract"].sudo().search(domain, order="stand_number")

    def _contract_needs_cutover(self, contract, cutoff, buckets):
        initial = contract.lakecity_initial_contract_move_id
        if buckets.get("pre_count") or buckets.get("lump_count"):
            return True
        if initial and initial.date and initial.date < cutoff:
            return True
        return False

    def _format_preview(self, preview, extra_lines=None):
        lines = [
            _("Accounting start: %s") % preview["cutoff_date"],
            _("Company: %s") % preview["company"],
            _("Loan contracts: %s") % preview["contract_count"],
            _("Stands with pre-start receipts or opening lumps: %s") % preview["stands_with_pre_or_lump"],
            _("Pre-start receipts: %(count)s totaling %(amount).2f")
            % {"count": preview["pre_count"], "amount": preview["pre_total"]},
            _("Opening paid to post (max of 2025 receipts vs existing lump): %.2f")
            % preview["opening_paid_total"],
            _("Stand-sales journal entries dated before start: %s") % preview["orphan_move_count"],
            "",
            _("Per stand (stand | 2025 receipts | 2025 total | opening lump | opening paid):"),
        ]
        rows = sorted(
            preview.get("stands") or [],
            key=lambda r: (-(r.get("pre_count") or 0), r.get("stand_number") or ""),
        )
        shown = 0
        for row in rows:
            if not row.get("pre_count") and not row.get("lump_count"):
                continue
            lines.append(
                "  %s | %s | %.2f | %.2f | %.2f"
                % (
                    row.get("stand_number") or "—",
                    row.get("pre_count") or 0,
                    row.get("pre_total") or 0.0,
                    row.get("lump_total") or 0.0,
                    row.get("opening_paid") or 0.0,
                )
            )
            shown += 1
            if shown >= 80:
                lines.append(_("  …"))
                break
        if extra_lines:
            lines.extend(extra_lines)
        return "\n".join(lines)

    def action_preview(self):
        self.ensure_one()
        preview = self.company_id._lakecity_cutover_preview(
            cutoff_date=self.cutoff_date,
            stand_number=self.stand_number,
        )
        self.result_message = self._format_preview(preview)
        return self._reopen_self()

    def action_apply(self):
        self.ensure_one()
        if not self.company_id.lakecity_stand_sales_accounting_enabled:
            raise UserError(
                _("Turn on stand sales accounting on %s first.") % self.company_id.display_name
            )
        cutoff = self.cutoff_date
        if self.company_id.lakecity_accounting_start_date != cutoff:
            self.company_id.write({"lakecity_accounting_start_date": cutoff})

        contracts = self._contracts()
        ok = 0
        skipped = 0
        errors = []
        for contract in contracts:
            buckets = contract._lakecity_cutover_buckets(cutoff)
            if not self._contract_needs_cutover(contract, cutoff, buckets):
                skipped += 1
                continue
            try:
                contract._lakecity_cutover_from_posted_payments(
                    cutoff_date=cutoff,
                    force=True,
                    dry_run=False,
                )
                ok += 1
            except Exception as err:
                errors.append("%s (stand %s): %s" % (contract.name, contract.stand_number or "—", err))

        sweep = self.company_id._lakecity_unlink_pre_cutover_stand_moves(cutoff)
        preview = self.company_id._lakecity_cutover_preview(
            cutoff_date=cutoff,
            stand_number=self.stand_number,
        )
        extra = [
            "",
            _("Cutover finished."),
            _("Stands posted: %(ok)s  skipped (no pre-start activity): %(skipped)s  failures: %(fail)s")
            % {"ok": ok, "skipped": skipped, "fail": len(errors)},
            _("Leftover pre-start JEs unlinked: %(unlinked)s  remaining: %(remaining)s")
            % {"unlinked": sweep.get("unlinked") or 0, "remaining": sweep.get("remaining") or 0},
        ]
        if errors:
            extra.append(_("Errors (%(n)d):") % {"n": len(errors)})
            extra.extend(errors[:40])
            if len(errors) > 40:
                extra.append("…")
        self.result_message = self._format_preview(preview, extra_lines=extra)
        return self._reopen_self()

    def _reopen_self(self):
        return {
            "type": "ir.actions.act_window",
            "name": _("Accounting start cutover"),
            "res_model": "lakecity.accounting.cutover.wizard",
            "view_mode": "form",
            "target": "new",
            "res_id": self.id,
        }
