# Align Vault secrets to the real tenant UUID + add webhook secret

The four Odoo Vault secrets were originally named with the slug `lakecity` as a suffix (e.g. `odoo_url_lakecity`). The edge functions read using `profiles.tenant_id`, which is a UUID, so today the lookup fails. This step renames the four secrets to the UUID-suffixed form and adds a new `odoo_webhook_secret_<uuid>` for inbound Odoo automation calls.

> **Time required**: 5 minutes.

## 1. Confirm the tenant UUID

In the production Lovable Cloud SQL editor:

```sql
select id, slug from public.tenants where slug = 'lakecity';
```

You should get exactly one row. Note the `id` (UUID).

## 2. Run the rename + webhook secret script

Paste the contents of [`docs/sql/lakecity-odoo-vault-rename-and-webhook.sql`](../sql/lakecity-odoo-vault-rename-and-webhook.sql) into the Lovable Cloud SQL editor and execute. The script:

1. Resolves the lakecity tenant UUID.
2. Renames each of `odoo_url_lakecity`, `odoo_db_lakecity`, `odoo_uid_lakecity`, `odoo_api_key_lakecity` to the UUID-suffixed form.
3. Generates a 64-character hex bearer token and creates `odoo_webhook_secret_<uuid>`.

The script is idempotent — safe to re-run.

> **Important**: the bearer is printed in the `RAISE NOTICE` output **once**, when the secret is first created. Copy it immediately into a safe place (1Password / Bitwarden) — you will need it to configure Odoo automation rules in Step 5.
>
> If you missed it, re-read the value with:
>
> ```sql
> select public.vault_read_secret('odoo_webhook_secret_' || (select id::text from public.tenants where slug='lakecity'));
> ```

## 3. Verify the round-trip

The script ends with a SELECT that lists all `odoo_*` secrets. After running, you should see exactly five rows, all suffixed with the UUID:

```
odoo_api_key_<uuid>           ak_xxx...
odoo_db_<uuid>                anyandoro14-standledger
odoo_uid_<uuid>               6
odoo_url_<uuid>               https://anyandoro14-standledger.odoo.com
odoo_webhook_secret_<uuid>    a1b2c3...
```

If you also see slug-suffixed rows (`odoo_*_lakecity`), the rename refused because both names already exist. Delete the stale ones manually:

```sql
-- Only after confirming the UUID-suffixed secrets have the correct values:
delete from vault.secrets where name in (
  'odoo_url_lakecity',
  'odoo_db_lakecity',
  'odoo_uid_lakecity',
  'odoo_api_key_lakecity'
);
```

## 4. Hit the read-only edge function as a sanity check

```bash
# From your terminal, with $JWT being a valid customer-portal access token:
curl -sS -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"ping"}' \
  https://<your-project>.supabase.co/functions/v1/odoo-accounting-data \
  | jq
```

Expected response:

```json
{ "ok": true, "uid": 6 }
```

If you instead see `Missing Vault secret: odoo_url_<uuid>`, the rename didn't happen for that key — re-run the script.

## 5. Replicate in staging

If you tested in staging in Step 0, repeat this whole step in the staging Lovable Cloud SQL editor against the staging tenants table.

## 6. Sign-off

- [ ] Five UUID-suffixed Odoo Vault secrets exist; no slug-suffixed leftovers.
- [ ] Webhook bearer token copied to 1Password / Bitwarden.
- [ ] `odoo-accounting-data` ping returns `{ "ok": true, "uid": <number> }`.

Proceed to [05-import-history.md](05-import-history.md).
