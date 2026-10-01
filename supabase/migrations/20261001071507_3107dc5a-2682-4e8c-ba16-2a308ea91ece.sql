DROP POLICY IF EXISTS "tenants readable to all" ON public.tenants;
REVOKE SELECT ON public.tenants FROM anon;
CREATE POLICY "Internal staff can read tenants" ON public.tenants FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));