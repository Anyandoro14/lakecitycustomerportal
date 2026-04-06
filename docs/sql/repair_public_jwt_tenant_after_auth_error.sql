/*
  Run this ONLY if a previous migration attempt failed with:
    ERROR: permission denied for schema auth

  It removes old policies / auth.tenant_id(), then installs public.jwt_tenant_id()
  and the same tenant_isolation policies as migration 003/005/006.

  Safe to run once; then continue with any remaining migrations.
*/

DROP POLICY IF EXISTS "tenant_isolation" ON public.profiles;
DROP POLICY IF EXISTS "tenant_isolation" ON public.payment_transactions;
DROP POLICY IF EXISTS "tenant_isolation" ON public.monthly_statements;
DROP POLICY IF EXISTS "tenant_isolation" ON public.internal_users;
DROP POLICY IF EXISTS "tenant_isolation" ON public.audit_log;
DROP POLICY IF EXISTS "tenant_isolation" ON public.conversations;
DROP POLICY IF EXISTS "tenant_isolation" ON public.messages;
DROP POLICY IF EXISTS "tenant_isolation" ON public.support_cases;
DROP POLICY IF EXISTS "tenant_isolation" ON public.customer_invitations;
DROP POLICY IF EXISTS "tenant_isolation" ON public.customer_onboarding;
DROP POLICY IF EXISTS "tenant_isolation" ON public.contracts;
DROP POLICY IF EXISTS "tenant_isolation" ON public.installments;
DROP POLICY IF EXISTS "tenant_isolation" ON public.payment_receipts;

DROP FUNCTION IF EXISTS auth.tenant_id() CASCADE;

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt()->'app_metadata'->>'tenant_id')::uuid;
$$;

GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated, anon, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.profiles USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.payment_transactions USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.monthly_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.monthly_statements USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.internal_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.internal_users USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.audit_log USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.conversations USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.messages USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.support_cases USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.customer_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.customer_invitations USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.customer_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.customer_onboarding USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.contracts USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.installments USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.payment_receipts USING (tenant_id = public.jwt_tenant_id());
