# -*- coding: utf-8 -*-
"""
Staging-only helper: export per-stand client vs Stand Sales AR balances.

Run on Odoo.sh **Staging** Web Shell (NOT Production):

  cd /home/odoo/src/user   # or your checkout
  # From an Odoo shell with the Staging database selected, paste/exec this file,
  # or:  python3 -c 'exec(open(".../odoo_sh_export_stand_balances.py").read())'
  # Prefer: Odoo.sh → Shell → `odoo-bin shell -d <staging_db>` then:

      exec(open("/home/odoo/src/user/odoo/addons/lakecity_loan_management/scripts/odoo_sh_export_stand_balances.py").read())

Writes CSV under /tmp/lakecity_stand_balance_export.csv

Columns:
  stand_number, partner_id, partner_name,
  odoo_client_balance (= contract.current_balance),
  stand_sales_balance (= posted 121000 residual on moves linked to this contract),
  total_paid, total_with_tax,
  partner_ar_121000_all_stands (partner-level; multi-stand partners will differ)

Uses existing COA code 121000 and journal linkage via lakecity_loan_contract_id.
Does not invent account numbers. Does not write any records.
"""

from __future__ import annotations

import csv

# Available inside `odoo-bin shell`
env  # noqa: F821 — provided by Odoo shell

TRADE_AR_CODE = "121000"
OUT_PATH = "/tmp/lakecity_stand_balance_export.csv"


def _trade_ar(company):
    """Resolve 121000 — prefer company helper when available."""
    if hasattr(company, "_lakecity_trade_receivable_account"):
        acc = company._lakecity_trade_receivable_account()
        if acc:
            return acc
    Acc = env["account.account"].sudo()  # noqa: F821
    return Acc.search([("code", "=", TRADE_AR_CODE)], limit=1)


def _stand_sales_ar_for_contract(contract, ar_account):
    """Sum debit-credit on 121000 for posted moves linked to this loan contract."""
    if not ar_account:
        return None
    env.cr.execute(  # noqa: F821
        """
        SELECT COALESCE(SUM(aml.debit - aml.credit), 0)
          FROM account_move_line aml
          JOIN account_move am ON am.id = aml.move_id
         WHERE aml.account_id = %s
           AND am.lakecity_loan_contract_id = %s
           AND am.company_id = %s
           AND am.state = 'posted'
        """,
        (ar_account.id, contract.id, contract.company_id.id),
    )
    return float(env.cr.fetchone()[0] or 0.0)  # noqa: F821


def _partner_ar_all(company, partner, ar_account):
    if not ar_account or not partner:
        return None
    return company._lakecity_partner_ar_balance(partner, account=ar_account)


Contract = env["lakecity.loan.contract"].sudo()  # noqa: F821
contracts = Contract.search([], order="stand_number")
rows = []
for c in contracts:
    company = c.company_id
    ar = _trade_ar(company)
    partner = c.partner_id.commercial_partner_id if c.partner_id else False
    rows.append(
        {
            "stand_number": c.stand_number or "",
            "contract_id": c.id,
            "partner_id": partner.id if partner else "",
            "partner_name": partner.display_name if partner else "",
            "odoo_client_balance": c.current_balance,
            "stand_sales_balance": _stand_sales_ar_for_contract(c, ar),
            "total_paid": c.total_paid,
            "total_with_tax": c.total_with_tax,
            "partner_ar_121000_all_stands": _partner_ar_all(company, partner, ar)
            if hasattr(company, "_lakecity_partner_ar_balance")
            else "",
            "state": c.state,
        }
    )

fieldnames = list(rows[0].keys()) if rows else [
    "stand_number",
    "odoo_client_balance",
    "stand_sales_balance",
]
with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

print("Wrote %s rows → %s" % (len(rows), OUT_PATH))
print("Download from Staging shell, then run:")
print(
    "  node scripts/qc-odoo-stand-balances-vs-master.mjs "
    "--master-xlsx Master.xlsx --odoo-contracts-csv %s --out-dir ./tmp/odoo-balance-qc" % OUT_PATH
)
