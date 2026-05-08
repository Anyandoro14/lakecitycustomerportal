# 7-day monitoring window

After the cutover go-live, run a structured monitoring loop for 7 days before considering Sheets retirement (Step 11). The goal: catch slow-burn issues like the webhook missing 1 in 50 events, or a Vault secret rotation breaking syncs.

## Daily checklist (every weekday morning, ~10 minutes)

### 1. Open `/internal/odoo-audit` and verify

- KPIs: receipts_24h ≈ odoo_paid_24h (variance ≤ 1).
- "Paid in Odoo, not yet in Supabase" is empty or has at most 1 transient row that disappears on next refresh.
- Pending QC count is reasonable for the day's activity (not stuck at 100+).

### 2. Run the reconciliation SQL

In Lovable Cloud SQL editor, paste the contents of [`docs/sql/cutover-monitoring.sql`](../sql/cutover-monitoring.sql). Each query has a Pass/Fail expectation in its comment. If any returns "fail", investigate before proceeding.

Or run from your terminal:

```bash
bash scripts/cutover/run-daily-reconciliation.sh
```

This wraps the SQL queries and emits a single PASS/FAIL summary for an automation/cron friendly output.

### 3. Review function logs in Lovable Cloud

Filter to the in-scope edge functions:

- `odoo-webhook` — look for `WARN`/`ERROR` lines. The most common are:
  - `lakecity.collection.payment webhook missing stand_number` — usually a malformed automation rule payload; check the rule's Python action.
  - `lakecity.collection.payment update error` / `insert error` — Postgres-level issue; copy the error and grep for matching DB error.
- `odoo-sync-payment` — `no_match` rate. A few are normal (off-cycle payments); a sustained spike indicates the schedule import missed some stands or the Day-5 constraint rejected lines.
- `odoo-audit-data` — should be quiet; only the audit page hits it.

### 4. Smoke-check 5 random customer accounts

Pick 5 random `profiles.stand_number` from production and:

```sql
select stand_number, full_name from profiles tablesample bernoulli (1) limit 5;
```

For each, log into the customer portal as that customer (using a magic-link or admin impersonation tool if you have one) and confirm the dashboard renders without errors. Compare Total Paid against the same query in Odoo:

```python
# In Odoo's developer mode → ORM Query
sched = env['lakecity.collection.schedule'].search([('stand_number','=','<NUMBER>')], limit=1)
print(sched.total_paid, sched.current_balance)
```

The portal's Total Paid should match `sched.total_paid` within rounding.

## Weekly checklist (every Friday, ~30 minutes)

### 1. Aggregate variance trend

Pull the variance counts from the last 7 days:

```sql
select date_trunc('day', created_at) as day,
       count(*) as receipts_created,
       count(*) filter (where odoo_collection_payment_id is not null) as odoo_origin,
       count(*) filter (where qc_status = 'approved') as approved
from payment_receipts
where created_at >= now() - interval '7 days'
group by 1
order by 1;
```

The `odoo_origin` count should be ≥ 95% of `receipts_created` after the 7-day mark. If lower, some Kuva receipts aren't getting linked — check `odoo_sync_status='no_match'` rows.

### 2. Reconciliation total

Compare the grand total of approved-Odoo receipts in DB vs. Odoo:

- DB:
  ```sql
  select sum(amount) from payment_receipts
  where qc_status = 'approved'
    and (odoo_collection_payment_id is not null or gateway = 'odoo');
  ```
- Odoo: `sum(env['lakecity.collection.payment'].search([('is_paid','=',True)]).mapped('amount_paid'))`

These should match within ±$10 across the entire portfolio. If higher: dig into the discrepancy with the daily reconciliation queries above.

### 3. Customer support ticket sweep

Search the support inbox for tickets in the last 7 days mentioning "balance", "payment not showing", or "receipt missing". Any ticket that requires staff to manually post-fix a balance is a cutover regression — investigate root cause and add a test for it.

## Alerting

For the 7-day window, configure a manual on-call rotation. Once these two signals trip, page the operator:

1. Lovable Cloud function logs show `odoo-webhook` errors > 5/hour for any 1-hour bucket.
2. `/internal/odoo-audit` "Paid in Odoo, not yet in Supabase" count > 5 for two consecutive refreshes (i.e., 60s apart).

## Pass criteria for moving to Step 11

After 7 consecutive days where:

- All daily checks PASS.
- Both weekly checks PASS.
- Zero customer support tickets attributable to the cutover.

You may proceed to [11-decommission-sheets.md](11-decommission-sheets.md). If any check fails, restart the 7-day clock from the day the issue was fully fixed.

## Sign-off

- [ ] Day 1 — daily checklist PASS.
- [ ] Day 2 — daily checklist PASS.
- [ ] Day 3 — daily checklist PASS.
- [ ] Day 4 — daily checklist PASS.
- [ ] Day 5 — weekly + daily PASS.
- [ ] Day 6 — daily checklist PASS.
- [ ] Day 7 — daily checklist PASS.
- [ ] Zero cutover-attributable tickets in 7 days.
