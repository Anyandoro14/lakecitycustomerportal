-- Add is_reusable column to twofa_bypass_codes table
ALTER TABLE public.twofa_bypass_codes 
ADD COLUMN IF NOT EXISTS is_reusable boolean NOT NULL DEFAULT false;