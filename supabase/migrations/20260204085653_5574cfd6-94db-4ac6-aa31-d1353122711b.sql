-- Add secondary phone number column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_number_2 text;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.phone_number_2 IS 'Secondary phone number for 2FA verification';