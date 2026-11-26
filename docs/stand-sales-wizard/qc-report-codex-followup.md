# QC report: stand-sales wizard migrations follow-up (commit `dfbddfc`)

Branch: `feat/stand-sales-wizard`. Scope: the live-shape rework of
`20261125183000_stand_sales_wizard.sql`, `20261125183100_auth_hook_search_path.sql`,
`20261125183200_campaign_stands.sql`, `src/lib/stand-sales/migrations-live-shape.test.ts` and
`docs/stand-sales-wizard/live-apply.sql`. No remote or live database was contacted; all DB checks ran
against throwaway databases on the local Docker Supabase Postgres (`127.0.0.1:54322`) and were dropped.

## Verdict: **FIX**

The migrations now apply cleanly and replay safely on the live shape, and they leave
`handle_new_user()` and the `on_auth_user_created` trigger alone. Two things should be fixed before
the migrations ship. First, fresh local replay can no longer create auth users, which breaks the
wizard's portal-login step. Second, the migration adds a new `stand_inventory` read policy that
bypasses tenant scoping.

## Findings

### 1. High: fresh repo replay can no longer create auth users (portal login breaks)

`20261125183100` used to replace `public.handle_new_user()` so new profiles got the LakeCity
`tenant_id`. The rework removed that replacement. In a fresh replay of the repo migrations,
`profiles.tenant_id` is `NOT NULL` (`20260401000002_tenant_id_columns.sql:28`), and the original
trigger (`20251118080444_...sql`) inserts only `(id, email)`. So every `auth.users` insert fails,
including `createPortalUser` in `supabase/functions/_shared/stand-sales-store.ts:243`, which runs after
a paid sale.

Reproduced on a repo-shape scratch DB:

- At HEAD, the `auth.users` insert fails with `null value in column "tenant_id" of relation "profiles" violates not-null constraint`.
- With the parent commit's `20261125183100`, the same insert succeeds.

The live shape is unaffected because it has no `profiles.tenant_id`. However, the migration header
claims to support fresh local replay, and that path regressed.

Suggested fix, which still leaves the auth trigger function alone: in a guarded `DO` block, only
when `public.profiles.tenant_id` exists, give the column a default from a small
`security definer` SQL function that returns the `lakecity` tenant id (subqueries aren't allowed
directly in defaults). Another option is to re-introduce the `handle_new_user()` replacement, but
only inside that same column-exists guard. Either way, add a repo-shape case to the migration test.

### 2. Medium: the new `"staff read campaign stands"` policy bypasses tenant isolation

`20261125183000` lines 402-418 add a permissive SELECT policy:
`is_internal_user(auth.uid()) and campaign_stand = true`. It has no tenant predicate. Permissive
policies are combined with OR, so on a database that already has
`internal_tenant_select_stand_inventory` (tenant-scoped, from `20260512120001`), this widens access.

Reproduced: an internal user of a second tenant, with that tenant in their JWT, could read all 38
LakeCity campaign stands (`rows visible to other-tenant staff=38`). This policy is new in this pass;
the parent commit had no policy on `stand_inventory`. Nothing in `src/` reads `campaign_stand`
through the authenticated client, and the wizard reads it with the service role, so the policy
looks unnecessary.

Suggested fix: drop the policy, or add `and tenant_id = public.jwt_tenant_id()` when that function
exists.

### 3. Low: the campaign flag update is not tenant-scoped (pre-existing)

`20261125183200` sets `campaign_stand = true` by `stand_number` alone, across every tenant. If
another tenant ever has a matching stand number, it would be flagged. Combined with finding 2, that
row would also become readable to internal staff in every tenant. Suggest adding
`and tenant_id = (select id from public.tenants where slug = 'lakecity')`.

### 4. Low: test coverage gap

`migrations-live-shape.test.ts` covers only the live shape, with a single apply. It does not cover
a second apply (idempotency), the repo-replay shape (which would have caught finding 1), or RLS.
The test is opt-in (`RUN_LOCAL_DB_MIGRATION_TEST=1`), so CI never runs it.

### 5. Info

- **`status` casing change:** seed rows changed from `'Available'` to `'available'`. This is harmless, because `decorateStands` (`stand-sales-service.ts:398`) and `src/lib/stand-inventory.ts:19` both compare case-insensitively. Existing rows are still not overwritten (`on conflict do nothing`).
- **`stand_inventory` created from scratch on live:** if the table is missing on live, it gets none of the `20260512120001` tenant policies, `stand_inventory_buyer`, or the `trg_stand_inventory_updated` trigger. That is acceptable for the wizard (service-role access, and the RPC sets `updated_at` itself), but staff UI that relies on those policies will see nothing.
- **`20261125183100` on live:** if a live `handle_auth_login()` exists, the migration still alters it to pin `search_path = public`. Any unqualified reference to a non-`public` object in that live body would then break. This is low risk, but it is a live auth-path change; confirm the live function body before applying.
- **Unknown `application_id` in the RPC:** `apply_stand_sales_payment` raises an FK error instead of returning `unmatched` when the application id is unknown. This is pre-existing and the function is unchanged in this pass. Callers always pass the attempt's own application id.
- **Policy creation is idempotent:** policies are dropped and recreated, with a `using (false)` fallback when `is_internal_user(uuid)` is absent.
- **Payment function permissions are intact:** `apply_stand_sales_payment` is still revoked from `public`/`anon`/`authenticated` and granted only to `service_role`, with `search_path` pinned.
- **`live-apply.sql`:** applies all three migrations and their version rows in one transaction. It uses `\i`, so it must be run from the repository root, as its header says.

### iVeri TEST-only check: no violation

None of the migrations enable payments. `iveriConfigFromEnv` still refuses anything other than
`IVERI_ENVIRONMENT=test` and allows only the `portal.host.iveri.com` TEST hosts. Simulations stay
behind `ALLOW_DEV_SIMULATIONS=true`. `.env.example` and `supabase/config.toml` keep iVeri off by
default.

## Checks run

| Check | Result |
| --- | --- |
| `RUN_LOCAL_DB_MIGRATION_TEST=1 npx vitest run src/lib/stand-sales/migrations-live-shape.test.ts` | Pass |
| `npx vitest run src/lib/stand-sales` | 16 passed, 2 skipped (env-gated) |
| `npx eslint src/lib/stand-sales/migrations-live-shape.test.ts` | Clean |
| Live shape: `live-apply.sql` twice, then raw migrations a third time | All pass; 38 campaign rows; 3 version rows; no duplicate constraints; `auth.users` insert OK |
| Repo replay shape (`profiles.tenant_id NOT NULL`), HEAD vs parent `20261125183100` | HEAD **fails** on `auth.users` insert; parent succeeds (finding 1) |
| `handle_auth_login` `search_path` after migration | `search_path=public` (same as before) |
| RLS: other-tenant internal user reads `stand_inventory` | 38 rows visible (finding 2) |
| `apply_stand_sales_payment` body diff vs parent | Unchanged |

The scratch harness lives outside the repo at `/tmp/qc-stand-sales/run.sh`. It ran only against
the local Docker Postgres.
