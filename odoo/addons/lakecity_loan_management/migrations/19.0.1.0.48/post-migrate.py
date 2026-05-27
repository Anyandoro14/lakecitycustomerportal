# -*- coding: utf-8 -*-
"""Upgrade to 19.0.1.0.48 — stand cost master, project phase reporting."""
import logging

from odoo import SUPERUSER_ID, api
from odoo.tools.float_utils import float_is_zero

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    StandCost = env["lakecity.stand.cost"].sudo()

    for company in env["res.company"].search([]):
        StandCost.with_company(company)._lakecity_import_from_csv(company=company)

    Contract = env["lakecity.loan.contract"].sudo()
    for contract in Contract.search([]):
        cost = StandCost._lakecity_lookup_by_stand(contract.stand_number)
        if not cost:
            continue
        rnd = contract.currency_id.rounding if contract.currency_id else 0.01
        vals = {
            "lakecity_stand_cost_id": cost.id,
            "lakecity_stand_phase_id": cost.phase_id.id,
        }
        if float_is_zero(contract.stand_cost or 0.0, precision_rounding=rnd):
            vals["stand_cost"] = cost.total_cost
        contract.write(vals)

    Product = env["product.template"].sudo()
    for tmpl in Product.search([("lakecity_stand_number", "!=", False)]):
        tmpl._lakecity_apply_stand_cost()

    Move = env["account.move"].sudo()
    for move in Move.search(
        [("lakecity_loan_contract_id", "!=", False), ("lakecity_stand_phase_id", "=", False)]
    ):
        phase = move.lakecity_loan_contract_id.lakecity_stand_phase_id
        if not phase:
            continue
        move.write({"lakecity_stand_phase_id": phase.id})
        move.line_ids.write({"lakecity_stand_phase_id": phase.id})

    _logger.info("Lakecity stand cost master migration 19.0.1.0.48 complete.")
