-- V2 foundation guardrails: feature flags, rollout gates, and integration registry.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'prod' CHECK (environment IN ('dev', 'staging', 'prod')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, flag_id, environment)
);

CREATE TABLE IF NOT EXISTS public.tenant_rollout_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'staging' CHECK (environment IN ('dev', 'staging', 'prod')),
  gate_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'waived')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ,
  checked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, gate_name)
);

CREATE TABLE IF NOT EXISTS public.integration_secret_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'prod' CHECK (environment IN ('dev', 'staging', 'prod')),
  provider TEXT NOT NULL,
  secret_key_name TEXT NOT NULL,
  rotated_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, provider, secret_key_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_lookup
  ON public.tenant_feature_flags (tenant_id, environment, enabled);
CREATE INDEX IF NOT EXISTS idx_tenant_rollout_gates_lookup
  ON public.tenant_rollout_gates (tenant_id, environment, status);
CREATE INDEX IF NOT EXISTS idx_integration_secret_registry_lookup
  ON public.integration_secret_registry (tenant_id, environment, provider);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rollout_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_secret_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.tenant_feature_flags;
CREATE POLICY tenant_isolation ON public.tenant_feature_flags
  USING (tenant_id = public.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON public.tenant_rollout_gates;
CREATE POLICY tenant_isolation ON public.tenant_rollout_gates
  USING (tenant_id = public.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON public.integration_secret_registry;
CREATE POLICY tenant_isolation ON public.integration_secret_registry
  USING (tenant_id = public.jwt_tenant_id());

DROP POLICY IF EXISTS internal_read_flags ON public.feature_flags;
CREATE POLICY internal_read_flags ON public.feature_flags
  FOR SELECT
  USING (public.is_internal_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_tenant_id UUID,
  p_flag_key TEXT,
  p_environment TEXT DEFAULT 'prod'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH flag AS (
    SELECT id, default_enabled
    FROM public.feature_flags
    WHERE key = p_flag_key
  )
  SELECT COALESCE(tff.enabled, flag.default_enabled, FALSE)
  FROM flag
  LEFT JOIN public.tenant_feature_flags tff
    ON tff.flag_id = flag.id
   AND tff.tenant_id = p_tenant_id
   AND tff.environment = p_environment;
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(UUID, TEXT, TEXT) TO authenticated, service_role;

INSERT INTO public.feature_flags (key, description, default_enabled)
VALUES
  ('v2_dual_write_enabled', 'Enable dual write from legacy payments into v2 transaction model', FALSE),
  ('v2_shadow_read_enabled', 'Enable shadow read comparison between legacy and v2 balances', FALSE),
  ('v2_customer_read_enabled', 'Allow customer data API to read v2 compatibility views', FALSE),
  ('v2_crm_app_enabled', 'Enable standalone CRM app APIs and UI', FALSE)
ON CONFLICT (key) DO NOTHING;
