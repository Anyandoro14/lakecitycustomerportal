-- Add payment_start_date column to profiles table
-- Default value: 5 September 2025 (2025-09-05)
-- This allows per-customer override for when their payments begin

ALTER TABLE public.profiles
ADD COLUMN payment_start_date date NOT NULL DEFAULT '2025-09-05'::date;