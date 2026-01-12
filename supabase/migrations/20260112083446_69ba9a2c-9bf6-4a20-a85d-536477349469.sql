-- Drop the existing email-based RLS policy
DROP POLICY IF EXISTS "Users can view their own monthly statements" ON public.monthly_statements;

-- Create a security definer function to get user's stand_number from their profile
CREATE OR REPLACE FUNCTION public.get_user_stand_number(user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT stand_number FROM public.profiles WHERE id = user_id
$$;

-- Create new RLS policy based on stand_number association
-- Users can only view statements where the statement's stand_number matches their profile's stand_number
CREATE POLICY "Users can view their own monthly statements" 
ON public.monthly_statements 
FOR SELECT 
USING (
  stand_number = public.get_user_stand_number(auth.uid())
);

-- Make stand_number required on profiles for new users going forward (but keep nullable for existing data)
COMMENT ON COLUMN public.profiles.stand_number IS 'Primary business identifier - links user to their stand data';