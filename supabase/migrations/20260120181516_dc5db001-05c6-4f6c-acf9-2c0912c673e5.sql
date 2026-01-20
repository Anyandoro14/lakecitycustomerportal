-- Create table for admin-generated 2FA bypass codes
CREATE TABLE public.twofa_bypass_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    stand_number TEXT NOT NULL,
    bypass_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_by_email TEXT,
    customer_name TEXT
);

-- Enable RLS
ALTER TABLE public.twofa_bypass_codes ENABLE ROW LEVEL SECURITY;

-- Only internal users can view/create bypass codes
CREATE POLICY "Internal users can view bypass codes"
ON public.twofa_bypass_codes
FOR SELECT
TO authenticated
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create bypass codes"
ON public.twofa_bypass_codes
FOR INSERT
TO authenticated
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update bypass codes"
ON public.twofa_bypass_codes
FOR UPDATE
TO authenticated
USING (public.is_internal_user(auth.uid()));

-- Index for quick lookups
CREATE INDEX idx_bypass_codes_phone_expires ON public.twofa_bypass_codes(phone_number, expires_at);

-- Function to cleanup expired bypass codes
CREATE OR REPLACE FUNCTION public.cleanup_expired_bypass_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.twofa_bypass_codes 
  WHERE expires_at < now() OR used_at IS NOT NULL;
END;
$$;