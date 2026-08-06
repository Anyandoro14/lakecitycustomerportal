# -*- coding: utf-8 -*-
"""19.0.1.0.51 — Consolidate AR on 121000 (SQL-only; ORM path OOMs Odoo.sh)."""
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)


def _column_exists(cr, table, column):
    cr.execute(
        """
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = %s
           AND column_name = %s
        """,
        (table, column),
    )
    return bool(cr.fetchone())


def migrate(cr, version):
    env = api.Environment(
        cr,
        SUPERUSER_ID,
        {
            "tracking_disable": True,
            "mail_notrack": True,
            "active_test": False,
        },
    )
    total_lines = total_archived = total_detached = 0

    if _column_exists(cr, "res_company", "lakecity_bnpl_future_receivable_gl_enabled"):
        cr.execute(
            """
            UPDATE res_company
               SET lakecity_bnpl_future_receivable_gl_enabled = FALSE
            """
        )
    if _column_exists(cr, "res_company", "lakecity_bnpl_post_bank_payment_per_receipt"):
        cr.execute(
            """
            UPDATE res_company
               SET lakecity_bnpl_post_bank_payment_per_receipt = FALSE
            """
        )

    for company in env["res.company"].sudo().search([]):
        main_ar = company._lakecity_trade_receivable_account()
        if not main_ar:
            _logger.warning(
                "Lakecity 19.0.1.0.51: no 121000 for %s; skip", company.display_name
            )
            continue

        cr.execute(
            """
            UPDATE account_move_line AS aml
               SET account_id = %s
              FROM account_move AS am, account_account AS aa
             WHERE aml.move_id = am.id
               AND aml.account_id = aa.id
               AND am.company_id = %s
               AND am.state = 'posted'
               AND aa.id != %s
               AND aa.account_type = 'asset_receivable'
               AND aa.name ILIKE %s
            """,
            (main_ar.id, company.id, main_ar.id, "Trade Receivable —%"),
        )
        total_lines += cr.rowcount or 0

        cr.execute(
            """
            UPDATE account_account AS aa
               SET active = FALSE
             WHERE aa.account_type = 'asset_receivable'
               AND aa.id != %s
               AND aa.name ILIKE %s
               AND aa.active IS TRUE
               AND NOT EXISTS (
                    SELECT 1
                      FROM account_move_line AS aml
                      JOIN account_move AS am ON am.id = aml.move_id
                     WHERE aml.account_id = aa.id
                       AND am.state = 'posted'
               )
            """,
            (main_ar.id, "Trade Receivable —%"),
        )
        total_archived += cr.rowcount or 0

        # Detach mirror FKs only — unlinking posted moves in a loop OOMs workers.
        if _column_exists(cr, "lakecity_loan_contract", "lakecity_future_receivable_move_id"):
            cr.execute(
                """
                UPDATE lakecity_loan_contract
                   SET lakecity_future_receivable_move_id = NULL
                 WHERE company_id = %s
                   AND lakecity_future_receivable_move_id IS NOT NULL
                """,
                (company.id,),
            )
            total_detached += cr.rowcount or 0

        env.invalidate_all()

    _logger.info(
        "Lakecity 19.0.1.0.51: SQL moved %s AR line(s) to 121000, archived %s orphan "
        "account(s), detached %s BNPL mirror FK(s)",
        total_lines,
        total_archived,
        total_detached,
    )
