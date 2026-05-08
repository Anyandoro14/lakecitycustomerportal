-- ============================================================================
-- LakeCity Odoo 19 / Odoo.sh — Supabase Vault secrets seed
-- ----------------------------------------------------------------------------
-- Inserts (or updates) the four secrets that
-- supabase/functions/_shared/odoo-client.ts reads via `vault_read_secret(...)`.
-- Suffix is the LakeCity tenant_id (UUID), not the slug.
-- ============================================================================
--
-- Recommended usage (psql with -v variables):
--
--   psql "$SUPABASE_DB_URL" \
--     -v ON_ERROR_STOP=1 \
--     -v tenant_id="$(psql "$SUPABASE_DB_URL" -tAc \
--                     "SELECT id FROM public.tenants WHERE slug='lakecity'")" \
--     -v odoo_url='https://lakecity.odoo.com' \
--     -v odoo_db='lakecity-production-12345' \
--     -v odoo_uid='12' \
--     -v odoo_api_key='ak_xxxxxxxxxxxxxxxx' \
--     -f docs/sql/lakecity-odoo-vault-secrets.sql
--
-- The wrapper script `scripts/setup-lakecity-odoo-vault.sh` does the same
-- interactively. This script is idempotent: re-running with new values
-- updates the four secrets in place.
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?tenant_id}
\else
  \echo 'ERROR: pass -v tenant_id=<UUID>'
  \quit
\endif

\if :{?odoo_url}
\else
  \echo 'ERROR: pass -v odoo_url=<https://...>'
  \quit
\endif

\if :{?odoo_db}
\else
  \echo 'ERROR: pass -v odoo_db=<db-name>'
  \quit
\endif

\if :{?odoo_uid}
\else
  \echo 'ERROR: pass -v odoo_uid=<integer-as-string>'
  \quit
\endif

\if :{?odoo_api_key}
\else
  \echo 'ERROR: pass -v odoo_api_key=<key>'
  \quit
\endif

-- ---- Upsert helper (transient) ---------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.lakecity_upsert_vault_secret(
  p_name text,
  p_value text,
  p_desc text
) RETURNS void AS $$
DECLARE
  sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.secrets WHERE name = p_name;
  IF sid IS NOT NULL THEN
    PERFORM vault.update_secret(sid, p_value, p_name, p_desc);
    RAISE NOTICE 'Updated Vault secret: %', p_name;
  ELSE
    PERFORM vault.create_secret(p_value, p_name, p_desc);
    RAISE NOTICE 'Created Vault secret: %', p_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---- Apply -----------------------------------------------------------------
SELECT pg_temp.lakecity_upsert_vault_secret(
  'odoo_url_'     || :'tenant_id',
  :'odoo_url',
  'LakeCity Odoo.sh production URL'
);
SELECT pg_temp.lakecity_upsert_vault_secret(
  'odoo_db_'      || :'tenant_id',
  :'odoo_db',
  'LakeCity Odoo.sh production database name'
);
SELECT pg_temp.lakecity_upsert_vault_secret(
  'odoo_uid_'     || :'tenant_id',
  :'odoo_uid',
  'NJere integrator user id on LakeCity DB'
);
SELECT pg_temp.lakecity_upsert_vault_secret(
  'odoo_api_key_' || :'tenant_id',
  :'odoo_api_key',
  'NJere integrator API key for LakeCity DB'
);

-- ---- Verify ----------------------------------------------------------------
-- Mirrors what supabase/functions/_shared/odoo-client.ts does at runtime.
-- All four must return non-NULL non-empty strings; the API key is masked.
\echo
\echo 'Verification (post-write read-back):'
SELECT
  'odoo_url'      AS key, public.vault_read_secret('odoo_url_'      || :'tenant_id') AS value
UNION ALL SELECT
  'odoo_db'      , public.vault_read_secret('odoo_db_'              || :'tenant_id')
UNION ALL SELECT
  'odoo_uid'     , public.vault_read_secret('odoo_uid_'             || :'tenant_id')
UNION ALL SELECT
  'odoo_api_key' , LEFT(public.vault_read_secret('odoo_api_key_'    || :'tenant_id'), 6) || '...'
;
