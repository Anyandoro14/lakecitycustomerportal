-- Add stand_number column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS stand_number TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_stand_number ON public.profiles(stand_number);

-- Update RLS policy to ensure users can only see their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);