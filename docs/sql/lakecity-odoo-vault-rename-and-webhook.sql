-- ============================================================================
-- LakeCity Odoo Vault — slug → UUID rename + add odoo_webhook_secret
-- ----------------------------------------------------------------------------
-- During initial setup the four Vault secrets were named with the tenant
-- *slug* as suffix (`odoo_url_lakecity`, etc.). The edge functions read with
-- the tenant *UUID* as suffix because `profiles.tenant_id` is a UUID.
--
-- This script:
--   1. Resolves the lakecity tenant UUID.
--   2. Renames `odoo_{url,db,uid,api_key}_lakecity` → `odoo_{...}_<uuid>`
--      in place (preserves the secret value, just changes the name field).
--   3. Adds a new `odoo_webhook_secret_<uuid>` with a freshly-generated bearer.
--
-- Idempotent: safe to re-run. If the slug-suffixed secret no longer exists,
-- the rename step is silently skipped. If the UUID-suffixed secret already
-- exists, the rename refuses to overwrite it (would silently break Odoo
-- credentials) — drop the old slug-suffixed secret manually first.
-- ============================================================================
--
-- Run from the Lovable Cloud SQL editor (or `psql "$SUPABASE_DB_URL"`):
--
--   \i docs/sql/lakecity-odoo-vault-rename-and-webhook.sql
--
-- Or paste the contents into the SQL editor and execute.
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_tenant_id uuid;
  v_slug      text := 'lakecity';
  v_old_name  text;
  v_new_name  text;
  v_old_id    uuid;
  v_new_id    uuid;
  v_keys      text[] := ARRAY['odoo_url', 'odoo_db', 'odoo_uid', 'odoo_api_key'];
  k           text;
  v_webhook_secret text;
  v_existing  uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant with slug=% found in public.tenants', v_slug;
  END IF;

  RAISE NOTICE 'Tenant % resolves to UUID %', v_slug, v_tenant_id;

  FOREACH k IN ARRAY v_keys LOOP
    v_old_name := k || '_' || v_slug;
    v_new_name := k || '_' || v_tenant_id::text;

    SELECT id INTO v_old_id FROM vault.secrets WHERE name = v_old_name;
    SELECT id INTO v_new_id FROM vault.secrets WHERE name = v_new_name;

    IF v_old_id IS NULL AND v_new_id IS NULL THEN
      RAISE NOTICE '  % : neither old nor new exists - skipping (run setup-lakecity-odoo-vault.sh first)', k;
    ELSIF v_old_id IS NULL AND v_new_id IS NOT NULL THEN
      RAISE NOTICE '  % : already named with UUID - nothing to do', k;
    ELSIF v_old_id IS NOT NULL AND v_new_id IS NULL THEN
      PERFORM vault.update_secret(v_old_id, NULL, v_new_name);
      RAISE NOTICE '  % : RENAMED % -> %', k, v_old_name, v_new_name;
    ELSE
      RAISE WARNING '  % : BOTH % and % exist. Refusing to overwrite. ' ||
                    'Confirm % is the canonical secret, then DELETE %.',
                    k, v_old_name, v_new_name, v_new_name, v_old_name;
    END IF;
  END LOOP;

  v_new_name := 'odoo_webhook_secret_' || v_tenant_id::text;
  SELECT id INTO v_existing FROM vault.secrets WHERE name = v_new_name;
  IF v_existing IS NULL THEN
    v_webhook_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(
      v_webhook_secret,
      v_new_name,
      'Bearer token for inbound Odoo automation webhooks (lakecity tenant)'
    );
    RAISE NOTICE 'Created %. Copy this value into Odoo automation rules: %',
                 v_new_name, v_webhook_secret;
  ELSE
    RAISE NOTICE '% already exists - leaving as-is. Read it via:', v_new_name;
    RAISE NOTICE '  SELECT public.vault_read_secret(''%'');', v_new_name;
  END IF;
END $$;

\echo
\echo 'Verification:'

SELECT
  name,
  CASE
    WHEN name LIKE 'odoo_api_key_%' OR name LIKE 'odoo_webhook_secret_%'
      THEN LEFT(public.vault_read_secret(name), 6) || '...'
    ELSE public.vault_read_secret(name)
  END AS value_preview
FROM vault.secrets
WHERE name LIKE 'odoo_%'
  AND (name LIKE '%_lakecity' OR name ~ '_[0-9a-f-]{36}$')
ORDER BY name;
