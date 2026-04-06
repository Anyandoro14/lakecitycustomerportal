# Supabase / Lovable Cloud — deployment runbook

Run these in **order** on the environment you are configuring (test first, then production).

---

## 1. Run the seven core migrations (SQL Editor)

**One-shot paste:** open `docs/sql/multi_tenant_migrations_001_through_007_combined.sql`, copy all, paste into **SQL Editor → Run** (same order as below).

Or run each file separately in **Supabase → SQL → New query**, one after the other:

| # | File | What it does |
|---|------|----------------|
| 1 | `supabase/migrations/20260401000001_tenants.sql` | `tenants` table + seed row |
| 2 | `supabase/migrations/20260401000002_tenant_id_columns.sql` | `tenant_id` on tenant-scoped tables + backfill |
| 3 | `supabase/migrations/20260401000003_rls_policies.sql` | RLS + `public.jwt_tenant_id()` helper (not `auth` schema — works in Lovable SQL editor) |
| 4 | `supabase/migrations/20260401000004_auth_hook.sql` | JWT `app_metadata` (`tenant_id`, `role`) via **DB triggers** on `auth.users` |
| 5 | `supabase/migrations/20260401000005_contracts_installments.sql` | `contracts`, `installments` |
| 6 | `supabase/migrations/20260401000006_payment_receipts.sql` | `payment_receipts` |
| 7 | `supabase/migrations/20260401000007_odoo_kuva_fields.sql` | Odoo/Kuva columns on `profiles` / `payment_transactions` |

**After the seven**, apply any newer migrations in this repo (by timestamp), for example:

- `20260402000001_payment_plans.sql` — `contract_balances` view + extra `contracts` columns  
- `20260402120000_ensure_lakecity_tenant.sql` — ensure slug `lakecity` exists  

**One paste for step 2 only:** `docs/sql/migrations_008_and_009_after_007_combined.sql` (do **not** re-run `multi_tenant_migrations_001_through_007_combined.sql` if tables already exist — you will get `relation already exists`).  

---

## 2. “Custom Access Token Hook” in the Dashboard

This repository implements tenant/role claims using **PostgreSQL triggers** in migration **004** (`handle_auth_login` on `auth.users`). That is **not** the same as Supabase’s optional **Edge Function** “Custom Access Token Hook.”

- **If 004 ran successfully:** JWT enrichment for `tenant_id` / role should already work. You do **not** have to register a separate Custom Access Token Hook **unless** your platform policy requires it.
- **If you must use the Dashboard hook:** you would need a dedicated Edge Function that mirrors the same logic; this repo does not ship that function today—prefer keeping the **004** trigger approach unless Supabase/Lovable docs say otherwise.

---

## 3. `tenants.spreadsheet_id` (Google Sheets)

Use the **tenant slug** that exists in your database (`lakecity` after the ensure migration; legacy DBs may still have `richcraft`).

```sql
UPDATE public.tenants
SET spreadsheet_id = '<YOUR_GOOGLE_SPREADSHEET_ID>'
WHERE slug IN ('lakecity', 'richcraft');
```

Verify:

```sql
SELECT slug, spreadsheet_id FROM public.tenants;
```

---

## 4. Webhook secrets (this codebase vs generic `_RICHCRAFT` env names)

Edge Functions resolve secrets **per tenant UUID** using **Vault** RPC names, not `ODOO_WEBHOOK_SECRET_RICHCRAFT` literals in code:

| Integration | Vault secret name (replace `<TENANT_UUID>`) |
|-------------|---------------------------------------------|
| Odoo webhook | `odoo_webhook_secret_<TENANT_UUID>` |
| Kuva webhook | `kuva_webhook_secret_<TENANT_UUID>` |
| Google Form intake | `receipt_intake_webhook_secret_<TENANT_UUID>` |

Get `TENANT_UUID`:

```sql
SELECT id, slug FROM public.tenants WHERE slug IN ('lakecity', 'richcraft');
```

Store the secret values in **Supabase Vault** (or your host’s secret store) so `vault_read_secret` works. If Lovable only exposes flat env vars, map those to Vault or adjust ops to match your host’s pattern.

**Other Edge Function env vars** (examples—see each function): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CLIENT_EMAIL`, `SPREADSHEET_ID` (fallback), `RESEND_API_KEY`, Twilio vars, etc.

Odoo JSON-RPC client settings (if used by your deployment) should match whatever `_shared/odoo-client.ts` and `odoo-sync-payment` expect—often stored per tenant or in env; align with your Odoo host.

---

## 5. Odoo → `odoo-webhook` URL

Automation rules should POST to:

`https://<PROJECT_REF>.supabase.co/functions/v1/odoo-webhook`

With header:

`Authorization: Bearer <same secret stored as odoo_webhook_secret_<tenant_id> for that tenant>`

Payload must include `_model`, `_id`, and fields as in `supabase/functions/odoo-webhook/index.ts`.

---

## 6. Smoke checks

- [ ] `SELECT * FROM public.tenants WHERE slug = 'lakecity';` returns one row.  
- [ ] Sign in as a customer: JWT `app_metadata.tenant_id` populated (004).  
- [ ] `odoo-webhook` and `kuva-webhook` return 401 without valid signature/secret.  
- [ ] `fetch-customer-data` / dashboard load against DB after data exists.

---

*Adjust slug names (`lakecity` vs `richcraft`) to match your live `public.tenants` rows.*
