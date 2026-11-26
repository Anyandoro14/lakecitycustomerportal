# QC report: stand-sales wizard migrations follow-up

Branch: `feat/stand-sales-wizard`. Scope: the live-shape rework of
`20261125183000_stand_sales_wizard.sql`, `20261125183100_auth_hook_search_path.sql`,
`20261125183200_campaign_stands.sql`, `src/lib/stand-sales/migrations-live-shape.test.ts` and
`docs/stand-sales-wizard/live-apply.sql`. No remote or live database was contacted; all DB checks ran
against throwaway databases on the local Docker Supabase Postgres (`127.0.0.1:54322`) and were dropped.

## Round 2 (re-review after follow-up fixes)

Reviewed state: the working tree on top of `c1cd6d7`. **The follow-up fixes are not committed yet**;
`HEAD` still contains the round-1 migrations.

### Verdict: **PASS** (conditional on how the fixes are committed)

All three round-1 problems are fixed and verified. No new correctness or safety problem was
found in the migrations. The PASS holds on two conditions:

- Commit the four reviewed files (the three migrations and the test), so that `HEAD` matches what
  was reviewed.
- Keep `supabase/functions/mcp/index.ts` out of that commit (see the blocking note below).

### Round-1 findings: status

| # | Round-1 finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | High: fresh repo replay could not create auth users | **Fixed** | `20261125183100` creates `default_lakecity_tenant_id()` and sets it as the `profiles.tenant_id` default, but only when that column exists. On a repo-shape DB, an `auth.users` insert now succeeds and the profile gets the LakeCity tenant. Re-applying the migration also succeeds. `handle_new_user()` is untouched. |
| 2 | Medium: `"staff read campaign stands"` policy bypassed tenant isolation | **Fixed** | The policy was removed. Other-tenant staff now see 0 LakeCity rows, and the only policy left on `stand_inventory` is the original tenant-scoped `internal_tenant_select_stand_inventory`. |
| 3 | Low: campaign flag update was not tenant-scoped | **Fixed** | The update is now scoped to the `lakecity` tenant. Another tenant's stand `3567` stays `campaign_stand=false`. |
| 4 | Low: test coverage gap | **Mostly fixed** | The test now covers a double apply, policy absence, and a repo-replay auth-user insert with `profiles.tenant_id NOT NULL`. It still doesn't cover campaign scoping across tenants, and it remains opt-in (`RUN_LOCAL_DB_MIGRATION_TEST=1`), so CI doesn't run it. |

### New observations

- **Blocking for the commit (not a migration finding): `supabase/functions/mcp/index.ts` has an unrelated uncommitted change.** It looks like a regenerated Lovable MCP bundle. The diff:
  - inlines a local env object (the `127.0.0.1:54321` Supabase URL, a demo anon key, and a `VITE_PAYMENTS_CLIENT_TOKEN: "live_..."` value);
  - replaces `projectRef = "gumkxjeahojrcaqnosyz"` with `define_import_meta_env_default.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset"`. The inlined object has no `VITE_SUPABASE_PROJECT_ID`, so the project ref would resolve to `"project-ref-unset"`.

  Committing it would break the deployed MCP's project ref and bake local and payment env values into source. Revert it, or leave it unstaged (`git checkout -- supabase/functions/mcp/index.ts`).
- **Low: `public.default_lakecity_tenant_id()` is `SECURITY DEFINER` with the default PUBLIC execute grant.** Because it lives in `public`, PostgREST exposes it as an RPC, and anonymous callers could read the LakeCity tenant UUID. That value is not a secret, so the impact is minimal.
  - Optional hardening: `revoke execute on function public.default_lakecity_tenant_id() from public, anon;` then `grant execute ... to authenticated, service_role;`.
  - Keep execute for whichever roles insert into `profiles` without a `tenant_id`, because column defaults are evaluated as the inserting role. This is not blocking.
- **Info: the `profiles.tenant_id` default is set unconditionally whenever the column exists.** On a database that already had a different default, the migration replaces it. Live has no such column and repo replay has no prior default, so this doesn't matter today.
- **Info: the live shape is unchanged.** `default_lakecity_tenant_id()` is not created on the live shape (no `profiles.tenant_id`), so on live, `20261125183100` still only pins `search_path` on a pre-existing `handle_auth_login()`.

### iVeri TEST-only check: no violation

No payment or iVeri code changed in this round. Payments stay off unless `IVERI_ENVIRONMENT=test`,
only TEST hosts are allowed, and simulations require `ALLOW_DEV_SIMULATIONS=true`.

### Checks run (round 2)

| Check | Result |
| --- | --- |
| `RUN_LOCAL_DB_MIGRATION_TEST=1 npx vitest run src/lib/stand-sales/migrations-live-shape.test.ts` | 2/2 pass (live shape with double apply; repo replay auth insert) |
| `npx vitest run src/lib/stand-sales` | 16 passed, 3 skipped (env-gated) |
| `npx eslint src/lib/stand-sales/migrations-live-shape.test.ts` | Clean |
| Live shape: `live-apply.sql` twice, then raw migrations a third time | All pass; 38 campaign rows; 3 version rows; 4 policies (no `stand_inventory` policy added); default function absent; `auth.users` insert OK |
| Repo replay shape: `auth.users` insert, `20261125183100` re-apply, default and grants | Insert OK; re-apply OK; default `default_lakecity_tenant_id()`; profile tenant = LakeCity; function is `SECURITY DEFINER` with default PUBLIC execute |
| RLS with a second tenant and internal user | 0 LakeCity rows visible; only `internal_tenant_select_stand_inventory` remains |
| Campaign scoping with the same stand number in another tenant | Other tenant's row stays `campaign_stand=false` |
| `git diff` review of the working tree | The three migrations and the test match the described fixes; unrelated `mcp/index.ts` change flagged |

The scratch harness lives outside the repo at `/tmp/qc-stand-sales/run2.sh`. It ran only against
the local Docker Postgres.

---

## Round 1 (commit `dfbddfc`): verdict FIX

The round-1 findings are kept below for history; their status is in the table above.

1. **High:** fresh repo replay could not create auth users. `20261125183100` had stopped replacing
   `handle_new_user()`, `profiles.tenant_id` is `NOT NULL` in repo replay, and the legacy trigger
   inserts only `(id, email)`. As a result, `createPortalUser`
   (`supabase/functions/_shared/stand-sales-store.ts:243`) failed with a NOT NULL violation.
2. **Medium:** the new `"staff read campaign stands"` permissive policy had no tenant predicate.
   Another tenant's internal user could read all 38 LakeCity campaign stands.
3. **Low:** `20261125183200` flagged campaign stands by `stand_number` across all tenants.
4. **Low:** the test covered only the live shape with a single apply.
5. **Info, still applicable:**
   - The seed `status` changed from `'Available'` to `'available'`; this is harmless because the comparisons are case-insensitive.
   - A `stand_inventory` created from scratch on live lacks the `20260512120001` tenant policies, `stand_inventory_buyer`, and the updated-at trigger.
   - `20261125183100` alters a pre-existing live `handle_auth_login()` to pin its `search_path`; confirm that function's body before applying.
   - `apply_stand_sales_payment` raises an FK error for an unknown application id. This is pre-existing and unchanged.
   - `live-apply.sql` must be run from the repository root.
