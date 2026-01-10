-- Add preferred_contact_method column to support_cases table
ALTER TABLE public.support_cases 
ADD COLUMN preferred_contact_method text NOT NULL DEFAULT 'email' 
CHECK (preferred_contact_method IN ('email', 'whatsapp'));