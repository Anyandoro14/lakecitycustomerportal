-- Add force_password_change column to internal_users table
ALTER TABLE public.internal_users 
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN public.internal_users.force_password_change IS 'When true, user must change password on next login';