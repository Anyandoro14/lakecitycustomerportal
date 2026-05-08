# Production cutover sequence

The actual go-live. This runbook is meant to be executed in a single window of ~60–90 minutes by one operator, with a second person on standby for the customer-side smoke tests.

> **Pre-conditions** (do not start otherwise):
> - All previous steps (01–08) signed off in staging.
> - Internal team freeze message sent ≥ 24 hours ago.
> - Two reviewers approved the `release/odoo-cutover` PR on GitHub.
> - Pre-flight backup taken today; snapshot file accessible.

## Roles

- **Operator** — runs the steps below in order, executes commands, deploys.
- **Smoke tester** — has 3 customer-portal test logins ready, performs Step 8.
- **On-call** — monitors Lovable Cloud function logs and is ready to run the rollback in [11-decommission-sheets.md](11-decommission-sheets.md) §"Rollback".

## Cutover sequence

### 1. Freeze (T+0)

- Operator posts in `#lakecity-ops`:
  > **Cutover started — please do not edit the Collection Schedule spreadsheet or approve receipts in the portal until I post the all-clear (~75 minutes).**
- Make the spreadsheet read-only for everyone except yourself: File → Share → change all editors to viewers (keep yourself as editor for one final snapshot).
- Note the timestamp in the cutover log.

### 2. Refresh the snapshot (T+5)

```bash
# On your laptop, with $PROD_DB_URL set
pg_dump "$PROD_DB_URL" --schema=public --format=custom \
  --no-owner --no-privileges \
  > "/tmp/lake-city-prod-cutover-$(date +%Y%m%d-%H%M).dump"

# Re-export the spreadsheet, including any edits in the last 24h
# (use the per-tab export procedure from 02-preflight.md / 05-import-history.md)
```

Confirm both files exist before proceeding.

### 3. Apply migrations + deploy edge functions (T+10)

The PR `release/odoo-cutover` should already be reviewed. Merge it now:

```bash
gh pr merge release/odoo-cutover --merge --auto
```

Lovable Cloud will:

- Apply `20260506230000_contracts_odoo_schedule_id.sql` and `20260507010000_payment_receipts_odoo_collection_payment.sql` to production Postgres.
- Deploy edge functions: `odoo-push-schedule`, `odoo-accounting-data`, `odoo-audit-data`, updated `odoo-webhook`, updated `odoo-sync-payment`, updated `generate-monthly-statements`.

Watch the Lovable Cloud deploy log:

- Each function should show `deployed` in green.
- Migration step should show `applied`.
- If anything fails: pause, fix the failing item, re-deploy. Do **not** proceed with a half-deployed state.

Sanity check from your terminal:

```bash
# Replace JWT with a valid customer-portal access token for your tenant
curl -sS -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d '{"action":"ping"}' \
  https://YOUR-PROJECT.supabase.co/functions/v1/odoo-accounting-data | jq
# Expect: { "ok": true, "uid": <number> }
```

### 4. Install the addon on Odoo.sh production (T+25)

If the addon was already installed during Step 2, skip ahead. Otherwise:

1. In Odoo.sh dashboard → `anyandoro14-standledger` → ensure latest commit on `main` is built.
2. Open production Odoo → **Apps → Update Apps List**.
3. Search "Lakecity" → click **Install** on **Lakecity CRM — Collection Schedule**.
4. Wait ~30s. Confirm menu **Lakecity** is visible.

### 5. Run the XLSX historical import (T+30)

Follow [05-import-history.md](05-import-history.md) using the **fresh** snapshot from Step 2 above (not the older pre-flight snapshot).

Spot-check 5 stands (smaller than the 10 you did in staging — this is just a final sanity).

### 6. Configure Odoo automation rules (T+50)

Follow [06-reverse-sync.md](06-reverse-sync.md) §"Odoo automation rules to configure" and §"Configure the System Parameters in Odoo".

- Set `lakecity_crm.webhook_url` to your **production** Lovable Cloud URL.
- Set `lakecity_crm.webhook_bearer` to the value of `odoo_webhook_secret_<uuid>` from production Vault.
- Save and **Activate** both rules.

### 7. Smoke-test the staff side (T+60)

Operator, in production Odoo:

1. Pick one stand from the spot-checked list. Open it.
2. On the next unpaid month, set `amount_paid` to a tiny amount like `1.00` (you'll undo this).
3. Save.
4. Within 30 seconds, open `/internal/odoo-audit` in production. Confirm:
   - "Receipts in DB (24h)" incremented by 1.
   - "Last 50 Odoo-origin receipts" shows your test row at the top with `Sync = synced`.
5. Set `amount_paid` back to 0 → save. Refresh the audit page → row should disappear (the unpaid branch in `odoo-webhook` deletes the synced receipt).

If any of those don't work, **stop**, fix, and re-run. Do not proceed to step 8 with a broken sync.

### 8. Smoke-test the customer side (T+65)

Smoke tester takes over. Use 3 test customer logins (one short-term, one mid-term, one long-term contract). For each:

1. Sign in to the production customer portal.
2. Open the Dashboard. Note the **Total Paid** and **Current Balance** numbers.
3. Compare to the same numbers from a screenshot taken **before cutover** (pre-flight Step 4, the pre-cutover dashboard render).
4. Numbers must match identically. If any drift > $0.01, flag immediately.
5. Click into Monthly Statements → most recent month → confirm the closing balance matches the dashboard.

Smoke tester reports back to operator: PASS / FAIL.

### 9. Unfreeze (T+75)

If smoke tests pass:

- Post in `#lakecity-ops`:
  > **Cutover complete — all green. Please use Odoo for all payments and sales going forward. Do not edit the Collection Schedule spreadsheet (it's now read-only).**
- Re-share the spreadsheet as **view-only** for the team (File → Share → change to "Viewer"; do not give edit access to anyone, including yourself, after the snapshot is captured).
- Send the same message via WhatsApp to the staff group.

If smoke tests fail:

- Trigger rollback (see [11-decommission-sheets.md](11-decommission-sheets.md) §"Rollback").

### 10. Mark the cutover log entry "complete" (T+80)

Update the cutover log with timestamps for each step and any anomalies. This becomes the audit trail for the 7-day monitoring window.

## Smoke-test helper

A scripted version of step 7 that you can run from your laptop:

```bash
bash scripts/cutover/smoke-test-prod.sh
```

This:
- Hits `odoo-accounting-data` ping (verifies Vault + Odoo creds).
- Hits `odoo-audit-data` (verifies internal_users gate + Odoo lookup).
- Lists the most recent 5 receipts and prints them.
- Reports PASS / FAIL for each check.

## Rollback fast-path

If at T+65 the smoke tests fail and you can't fix in <15 min:

```bash
bash scripts/cutover/rollback.sh
```

Effects:
- Reverts `release/odoo-cutover` PR (creates a revert commit on `main`).
- Disables the Odoo automation rules (sets them inactive via JSON-RPC).
- Re-enables spreadsheet edit access.
- Posts the rollback message to `#lakecity-ops`.

The rollback is **idempotent** — safe to re-run.

## Sign-off

- [ ] Freeze announced and acknowledged.
- [ ] Final snapshot taken (DB dump + spreadsheet).
- [ ] PR merged; deploy log all green; migrations applied.
- [ ] Addon installed; XLSX history imported; 5-stand spot check passed.
- [ ] Automation rules + System Parameters configured.
- [ ] Staff smoke test passed (Odoo write → portal sees it within 30s).
- [ ] Customer smoke test passed (3 test logins, every visible number unchanged).
- [ ] Unfreeze announced; spreadsheet locked to view-only.
- [ ] Cutover log archived with timestamps.

Proceed to [10-monitor.md](10-monitor.md).
