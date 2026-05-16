
-- Fix: add DELETE policy for twofa_bypass_codes so internal users can clean up stale codes
CREATE POLICY "Internal users can delete bypass codes"
ON public.twofa_bypass_codes
FOR DELETE
TO authenticated
USING (public.is_internal_user(auth.uid()));

-- Fix: prevent anonymous (public/unauthenticated) readers from seeing author_email on articles.
-- Authenticated users (customers + internal staff) keep access; anon role loses column-level SELECT.
REVOKE SELECT (author_email) ON public.articles FROM anon;

-- Fix: password_reset_tokens has RLS enabled but no policies. It is only accessed via service_role
-- in edge functions, so add an explicit deny-all policy to make intent clear and silence the linter.
CREATE POLICY "No direct client access to password reset tokens"
ON public.password_reset_tokens
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
