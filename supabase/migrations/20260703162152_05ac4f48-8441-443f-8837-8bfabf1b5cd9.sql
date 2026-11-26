
-- 1. Minimal tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT ON public.tenants TO anon, authenticated;
GRANT ALL ON public.tenants TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants readable to all" ON public.tenants
  FOR SELECT USING (true);

-- The tenants table from 20260401000001 uses display_name. This migration used to
-- assume a `name` column, which stops a fresh local database before later migrations run.
INSERT INTO public.tenants (slug, display_name, is_active)
SELECT 'lakecity', 'Lake City', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'lakecity');

-- 2. jwt_tenant_id() helper
CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt()->'app_metadata'->>'tenant_id','')::uuid,
    (SELECT id FROM public.tenants WHERE slug = 'lakecity' LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated, anon, service_role;

-- 3. stand_portal_settings
CREATE TABLE IF NOT EXISTS public.stand_portal_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stand_number        TEXT NOT NULL,
  portal_enrolled     BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_required    BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_split_three BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_due_date    DATE,
  deposit_date_1      DATE,
  deposit_date_2      DATE,
  deposit_date_3      DATE,
  deposit_amount      NUMERIC(12,2) DEFAULT 0,
  payment_start_date  DATE,
  term_months         INTEGER,
  odoo_contract_id    INTEGER,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, stand_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stand_portal_settings TO authenticated;
GRANT ALL ON public.stand_portal_settings TO service_role;

CREATE INDEX IF NOT EXISTS idx_stand_portal_settings_tenant ON public.stand_portal_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stand_portal_settings_enrolled
  ON public.stand_portal_settings(tenant_id, portal_enrolled)
  WHERE portal_enrolled = TRUE;

ALTER TABLE public.stand_portal_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stand_portal_settings' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON public.stand_portal_settings
      USING (tenant_id = public.jwt_tenant_id());
  END IF;
END $$;

-- 4. Grandfather all existing profile stands as enrolled
INSERT INTO public.stand_portal_settings (tenant_id, stand_number, portal_enrolled, synced_at)
SELECT
  (SELECT id FROM public.tenants WHERE slug = 'lakecity' LIMIT 1),
  UPPER(TRIM(p.stand_number)),
  TRUE,
  NOW()
FROM public.profiles p
WHERE p.stand_number IS NOT NULL
  AND TRIM(p.stand_number) <> ''
ON CONFLICT (tenant_id, stand_number) DO UPDATE SET
  portal_enrolled = TRUE,
  synced_at = NOW(),
  updated_at = NOW();
