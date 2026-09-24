CREATE TABLE public.email_otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_otp_codes TO service_role;

ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to email otp codes"
ON public.email_otp_codes
FOR ALL
USING (false)
WITH CHECK (false);

CREATE INDEX idx_email_otp_codes_email_created ON public.email_otp_codes (lower(email), created_at DESC);

CREATE TRIGGER set_email_otp_codes_updated_at
BEFORE UPDATE ON public.email_otp_codes
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.cleanup_expired_email_otp_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.email_otp_codes
  WHERE expires_at < now() - interval '1 day' OR consumed_at IS NOT NULL;
END;
$$;