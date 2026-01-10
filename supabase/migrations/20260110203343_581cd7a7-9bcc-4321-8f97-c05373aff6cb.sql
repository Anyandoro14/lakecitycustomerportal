-- Fix function search path for generate_case_number
CREATE OR REPLACE FUNCTION public.generate_case_number()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.case_number := 'LC-' || LPAD(nextval('support_case_number_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$;