# Stand 272 sign-up failure: what the logs show (read-only)

Nothing was changed, deployed, written or sent.

## What I could read
- **register-user function logs:** none found.
- **validate-signup function logs:** none found.
- **Edge request logs from 13:00 UTC:** only two functions were called: `process-approved-receipts` (4 calls, last at 15:10:08) and `fetch-google-sheets` (4 calls, last at 15:05:07). None of them failed. There are **no requests at all** to register-user, validate-signup, stand-sales or iveri-*.
- **Auth logs from 13:00 UTC:** no errors, no responses of 400 or above, and no admin/users or "Database error creating new user" entries. The only activity is normal `/user` checks and one token refresh from lakecity.standledger.io between 15:04 and 15:05.
- **Postgres errors from 13:00 UTC (raw):**
```text
2026-11-26T15:04:52.057Z ERROR column tenants.spreadsheet_id does not exist
2026-11-26T15:04:52.514Z ERROR column tenants.spreadsheet_id does not exist
2026-11-26T15:04:53.992Z ERROR column profiles.tenant_id does not exist
2026-11-26T15:05:04.691Z ERROR column tenants.spreadsheet_id does not exist
2026-11-26T15:05:04.867Z ERROR column tenants.spreadsheet_id does not exist
2026-11-26T15:05:06.284Z ERROR column profiles.tenant_id does not exist
2026-11-26T15:09:45.660Z ERROR column "tenant_id" does not exist
```
  These match the times of the fetch-google-sheets and process-approved-receipts calls, not a sign-up. There are no unique-violation errors.
- **Schema check:** `profiles` has no `tenant_id` column. `stand_portal_settings` does have one. `tenants` has no `spreadsheet_id`.

## What this means
- The failed register-user call from 14:30 to 15:10 UTC **does not appear in any log I can reach**. It may never have reached the backend. Another possibility is that log retention or indexing is missing that invocation. I can't tell these two cases apart from here.
- stand-sales and iveri-* are **not** in the failing path. None of them were called in this window.
- **Deployed version:** the log tools don't expose version or deploy timestamps. In the repo, register-user and portal-enrollment last changed on 2026-11-06, but I can't confirm that the deployed copy matches main without a redeploy, which you ruled out.
- **Possible risk, unconfirmed:** register-user and validate-signup filter `profiles` by `tenant_id` whenever the caller's token carries one. That column doesn't exist, so the filter would fail. An anonymous sign-up normally carries no tenant, so this probably wasn't the cause for stand 272.

## Missing access
- I have no tool for the function version or deploy timestamp.
- I have no request-ID-level access to the edge logs beyond what's shown above.

## Suggested next steps (only after you approve)
1. Ask the customer to retry, then pull the logs right away, or share the browser's network response body for the failed call.
2. Check stand 272's entries in `stand_portal_settings` and `profiles`, read-only.
3. If needed, remove the `profiles.tenant_id` filters in a separate, approved change.
