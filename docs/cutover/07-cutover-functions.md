# Cut over the customer-portal-facing edge functions

This step ensures the customer portal continues to behave identically while the data source flips from Google Sheets to Odoo. We only modify the functions the customer portal (or its admin tools) call directly; the rest stay in the repo for emergency rollback but are disabled in `supabase/config.toml`.

## Code changes shipped in this PR

### `supabase/functions/odoo-sync-payment/index.ts` — rewritten

The function used to create an `account.payment` in Odoo (or call the loan-module API). It now:

- Looks up the matching `lakecity.collection.payment` line in Odoo by `(stand_number, due_date in receipt.payment_date's month)`, falling back to the next unpaid line for that stand if no exact match.
- Updates the line's `note` field with `[Kuva <ref>] amount=<x> pending QC (receipt <id>)` so staff can see the pending receipt in Odoo's CRM views.
- Writes back `payment_receipts.odoo_collection_payment_id` and `odoo_collection_schedule_id` so the eventual approval webhook (Step 6) finds the receipt and updates it in place rather than inserting a duplicate.
- **Does not** mark the line paid — that is the QC step, performed by staff inside Odoo.

This removes the dependency on `_shared/odoo-loan-api.ts` (out of scope for this cutover).

### `supabase/functions/generate-monthly-statements/index.ts` — default flipped

```diff
-    let source: 'sheets' | 'database' = 'sheets';
+    let source: 'sheets' | 'database' = 'database';
```

Plus an enhancement: when `source='database'` and no `tenant_id` is supplied in the body, the function now resolves it from the JWT (looks up `profiles.tenant_id` for the calling user). The customer-facing call from `src/pages/MonthlyStatements.tsx` doesn't pass `tenant_id`, so this preserves backward compatibility.

To force the legacy Sheet path during a rollback, callers can pass `{ source: 'sheets' }` explicitly.

### Customer-facing edge functions that **do not change**

- `fetch-customer-data` — keeps reading from `profiles`, `contracts`, `installments`, `payment_receipts`, `contract_balances`. After cutover, those tables are populated by Odoo via webhook instead of by staff editing the spreadsheet.
- `kuva-webhook` — keeps creating `payment_receipts` in `pending_qc` and firing `odoo-sync-payment`. The downstream behavior changes (now links to Odoo collection.payment line) but the inbound contract is unchanged.
- `submit-monthly-receipts`, `submit-receipt-feedback`, `audit-deposit-totals`, etc. — the customer-side QC submission and audit functions stay as-is.

## Functions to disable in `supabase/config.toml`

The plan calls for retiring the following edge functions because their only purpose is to read or write the legacy spreadsheet. They stay in the repo for ~30 days as a rollback fallback but should be removed from `[functions.<name>]` blocks in `supabase/config.toml` so Lovable Cloud stops routing to them.

| Function | Reason to disable |
|---|---|
| `process-approved-receipts` | QC now happens in Odoo; the Sheet write target is gone. |
| `incoming-message-webhook` | Updated `Receipts_Intake` rows; that tab is no longer the source of truth. |
| `backfill-registration-status` | Sheet-only diagnostics. |
| `rebuild-payments-from-sheet7` | Sheet 7 maintenance. |
| `scan-combined-deposits` | Sheet-only diagnostics. |
| `write-cell`, `clear-cell`, `fix-payment-cell` | Generic Sheet cell operations. |

Functions to **migrate to DB-only** (still customer-facing, but stop using Sheets):

| Function | Action |
|---|---|
| `lookup-stand-email` | Switch to `select email from profiles where stand_number=?`. |
| `request-password-reset` | Same — drop the Sheet-fallback branch. |
| `internal-portal-access` | Switch to DB query on `profiles`. |
| `manage-user-access` | Switch to DB query on `profiles` + `internal_users`. |
| `check-reporting-access` | Switch to DB query on `internal_users`. |
| `validate-signup` | Switch to DB query on `profiles`. |
| `verify-signup-otp` | Switch to DB query on `profiles`. |

The DB-only conversions of the second group are deferred to Step 10 (decommission) so that this PR remains tightly scoped. For the duration of the 30-day monitoring window, both code paths can run; the DB query just needs to be added as the primary and the Sheet fallback wrapped in `try/catch`.

## Frontend pages that invoke `fetch-google-sheets`

These are called out in the audit script results:

- `src/pages/Index.tsx`
- `src/pages/LookingGlassView.tsx`
- `src/pages/AgreementOfSaleDocuments.tsx`

They render Sheet data on internal/admin pages. Out of scope for this cutover (the customer portal proper does not use them in steady-state). They become candidates for retirement in Step 10 once Odoo data fully replaces the Sheet.

## Testing

In staging, after the new edge functions are deployed:

1. **`generate-monthly-statements` regression test**:
   ```bash
   curl -sS -X POST -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"target_stand": "TEST-001", "refresh": true}' \
     "$STAGING_URL/functions/v1/generate-monthly-statements" | jq '.success, .source'
   ```
   Expected: `true`, `"database"`. Compare a returned month-end balance with the same stand's spreadsheet → must match within rounding.

2. **`odoo-sync-payment` regression test** — simulate a Kuva webhook:
   ```bash
   # Insert a fake pending receipt
   psql "$STAGING_DB_URL" -c "
     insert into payment_receipts (tenant_id, stand_number, amount, payment_date,
       gateway, gateway_reference, qc_status, odoo_sync_status)
     values ('<tenant-uuid>', 'TEST-001', 50.00, current_date, 'kuva',
       'TEST-REF-001', 'pending_qc', 'pending')
     returning id;"
   # Use the returned id:
   curl -sS -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d "{\"receipt_id\":\"<id>\"}" \
     "$STAGING_URL/functions/v1/odoo-sync-payment" | jq
   ```
   Expected: `{"status":"ok","odoo_collection_payment_id":<n>,"odoo_collection_schedule_id":<n>}`.
   In Odoo, open the schedule for `TEST-001`; the matching payment line's `note` should now contain the Kuva reference.

3. **End-to-end QC flow**:
   - Continue from step 2: in Odoo, open that line, set `amount_paid = 50` and save.
   - Within ~5 seconds, the receipt in `payment_receipts` should flip to `qc_status='approved'` (driven by the Odoo automation rule + `odoo-webhook` from Step 6).
   - Open the staging customer portal as `TEST-001` → confirm the $50 payment appears.

## Sign-off

- [ ] `odoo-sync-payment` deployed; staging Kuva-style test linked the receipt to a collection.payment line.
- [ ] `generate-monthly-statements` default flipped to `database`; staging produces correct balances.
- [ ] End-to-end Kuva → odoo-sync-payment → Odoo QC → odoo-webhook → portal flow works in staging.
- [ ] No customer-visible regression on the staging portal smoke test.

Proceed to [08-audit-page.md](08-audit-page.md).
