# Daily Reconciliation (Odoo 19)

Standalone top-level Odoo app for LakeCity BNPL daily exception handling.

| | |
|---|---|
| **Technical name** | `daily_reconciliation` |
| **Menu** | **Daily Reconciliation** (own app icon — not under Accounting) |
| **Depends** | `mail`, `lakecity_loan_management` (≥ 19.0.1.0.69 for reconcile-export) |

## Install / upgrade (Odoo.sh)

1. Deploy this repo branch so `odoo/addons/daily_reconciliation` is on the addons path.
2. Apps → Update Apps List → install **Daily Reconciliation**.
3. Confirm the home menu shows **Daily Reconciliation** as its own app.
4. Internal users (`base.group_user`) can open the queue and use Match / Adjust Date / Needs Review. Optional group **Daily Reconciliation Admin** can unlink rows.

## How ops feed the queue

The compare engine stays in `scripts/daily-bnpl-three-way-reconcile.mjs` + Odoo
`GET /lakecity/api/v1/loan/reconcile-export`. This module only **ingests** issue rows.

### A. UI wizard

1. Run the daily script (see `docs/bnpl-accounting-cutover-and-daily-reconcile.md`).
2. In Odoo: **Daily Reconciliation → Import today's reconcile**.
3. Upload `docs/output/reconcile/bnpl-reconcile-YYYY-MM-DD.csv` (or the JSON twin), or choose **Load sample exceptions** to demo the queue.
4. Open **Exception Queue** — oldest first, side-by-side Collection vs Bank/Odoo, mismatch badges, one-click actions.

### B. HTTP ingest (automation)

Same Bearer token as the loan API (`ir.config_parameter` `lakecity_loan.api_token`):

```bash
# After the script writes CSV/JSON:
curl -X POST -H "Authorization: Bearer $LAKECITY_LOAN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @docs/output/reconcile/bnpl-reconcile-YYYY-MM-DD.json \
  "$ODOO_ORIGIN/lakecity/api/v1/daily-reconciliation/ingest"
```

Status / All Clear:

```bash
curl -H "Authorization: Bearer $LAKECITY_LOAN_API_TOKEN" \
  "$ODOO_ORIGIN/lakecity/api/v1/daily-reconciliation/status"
```

Script helper (optional):

```bash
node --env-file=.env scripts/daily-bnpl-three-way-reconcile.mjs \
  --collection ./collection.csv --sales ./sales.csv --odoo --push-queue
```

## All Clear

When **Exception Queue** has no open rows for today's filters, Odoo shows the empty-state **All Clear** banner — the signal to close the books for the day.

## Issue codes

Aligned with the runbook: `pre_cutoff_hit_bank`, `missing_receipt_unposted`, `amount_mismatch`, `balance_mismatch`, `stand_price_mismatch`, `wrong_date_day_month_swap`, `ambiguous_date_day_month`, `liquidity_account_unexpected`, `missing_in_odoo`, etc.
