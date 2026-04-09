-- Maps each customer to their Collection Schedule tab (canonical naming in 20260408140000)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_plan_months integer;

COMMENT ON COLUMN public.profiles.payment_plan_months IS
  'Installment term in months; matches Google Sheet tab "Collection Schedule - N Months". Default 36 for legacy Richcraft.';

UPDATE public.profiles
SET payment_plan_months = 36
WHERE payment_plan_months IS NULL;
