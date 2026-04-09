-- Canonical sheet tab: "Collection Schedule - {N}mo" (e.g. Collection Schedule - 36mo).
COMMENT ON COLUMN public.profiles.payment_plan_months IS
  'Installment term in months; matches Google Sheet tab "Collection Schedule - Nmo" (e.g. Collection Schedule - 36mo). Legacy "Collection Schedule - N Months" and "Collection Schedule 1" accepted until renamed. Default 36.';
