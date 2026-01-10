-- Create support_cases table for tracking customer support requests
CREATE TABLE public.support_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp_number TEXT,
  issue_type TEXT NOT NULL,
  sub_issue TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;

-- Users can view their own support cases
CREATE POLICY "Users can view their own support cases" 
ON public.support_cases 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own support cases
CREATE POLICY "Users can create their own support cases" 
ON public.support_cases 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create sequence for case numbers
CREATE SEQUENCE IF NOT EXISTS support_case_number_seq START WITH 1;

-- Create function to generate case number
CREATE OR REPLACE FUNCTION public.generate_case_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.case_number := 'LC-' || LPAD(nextval('support_case_number_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic case number generation
CREATE TRIGGER set_case_number
BEFORE INSERT ON public.support_cases
FOR EACH ROW
EXECUTE FUNCTION public.generate_case_number();

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_support_cases_updated_at
BEFORE UPDATE ON public.support_cases
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create monthly_statements table for immutable statement snapshots
CREATE TABLE public.monthly_statements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_email TEXT NOT NULL,
  stand_number TEXT NOT NULL,
  statement_month DATE NOT NULL,
  opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payments_received JSONB DEFAULT '[]'::jsonb,
  total_payments DECIMAL(12, 2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_overdue BOOLEAN DEFAULT FALSE,
  days_overdue INTEGER DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_monthly_statement UNIQUE (customer_email, stand_number, statement_month)
);

-- Enable Row Level Security
ALTER TABLE public.monthly_statements ENABLE ROW LEVEL SECURITY;

-- Users can view their own statements (by matching email)
CREATE POLICY "Users can view their own monthly statements" 
ON public.monthly_statements 
FOR SELECT 
USING (
  customer_email = (
    SELECT email FROM auth.users WHERE id = auth.uid()
  )
);

-- Add full_name column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;