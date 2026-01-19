-- Add 'director' to internal_role enum
ALTER TYPE public.internal_role ADD VALUE IF NOT EXISTS 'director';