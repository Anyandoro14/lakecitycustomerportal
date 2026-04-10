-- Compatibility views and reconciliation controls for zero-break rollout.

CREATE TABLE IF NOT EXISTS public.shadow_read_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  compared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_current_balance NUMERIC(14, 2),
  v2_current_balance NUMERIC(14, 2),
  variance_amount NUMERIC(14, 2),
  variance_percent NUMERIC(9, 4),
  within_tolerance BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.cutover_acceptance_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'staging' CHECK (environment IN ('dev', 'staging', 'prod')),
  gate_code TEXT NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_by UUID REFERENCES auth.users(id),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, environment, gate_code)
);

ALTER TABLE public.shadow_read_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutover_acceptance_gates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.shadow_read_comparisons;
CREATE POLICY tenant_isolation ON public.shadow_read_comparisons
  USING (tenant_id = public.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON public.cutover_acceptance_gates;
CREATE POLICY tenant_isolation ON public.cutover_acceptance_gates
  USING (tenant_id = public.jwt_tenant_id());

CREATE INDEX IF NOT EXISTS idx_shadow_read_lookup
  ON public.shadow_read_comparisons (tenant_id, compared_at DESC, within_tolerance);
CREATE INDEX IF NOT EXISTS idx_cutover_acceptance_lookup
  ON public.cutover_acceptance_gates (tenant_id, environment, passed);

CREATE OR REPLACE VIEW public.v2_contract_balance_view WITH (security_invoker = true) AS
SELECT
  c.id AS contract_id,
  c.tenant_id,
  c.customer_id,
  c.stand_number,
  c.total_price,
  c.deposit_amount,
  c.monthly_installment,
  c.term_months,
  c.payment_start_date,
  c.status,
  lb.loan_id,
  COALESCE((l.principal_amount - lb.principal_outstanding), 0)::NUMERIC(12,2) AS total_paid,
  COALESCE(lb.principal_outstanding, c.total_price)::NUMERIC(12,2) AS current_balance,
  CASE
    WHEN COALESCE(l.principal_amount, 0) > 0 THEN ROUND(((l.principal_amount - COALESCE(lb.principal_outstanding, l.principal_amount)) / l.principal_amount) * 100, 1)
    ELSE 0
  END AS progress_percentage,
  (
    SELECT MAX(le.event_at)::DATE
    FROM public.loan_events le
    WHERE le.loan_id = lb.loan_id
      AND le.event_type = 'PAYMENT_POSTED'
  ) AS last_payment_date,
  (
    SELECT le.amount
    FROM public.loan_events le
    WHERE le.loan_id = lb.loan_id
      AND le.event_type = 'PAYMENT_POSTED'
    ORDER BY le.event_at DESC
    LIMIT 1
  ) AS last_payment_amount
FROM public.contracts c
LEFT JOIN public.v2_contract_loan_links lnk ON lnk.contract_id = c.id
LEFT JOIN public.loan_balances lb ON lb.loan_id = lnk.loan_id
LEFT JOIN public.loans l ON l.id = lnk.loan_id;

GRANT SELECT ON public.v2_contract_balance_view TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v2_legacy_balance_variance_view WITH (security_invoker = true) AS
SELECT
  cb.contract_id,
  cb.tenant_id,
  cb.current_balance AS legacy_current_balance,
  v2.current_balance AS v2_current_balance,
  (COALESCE(v2.current_balance, 0) - COALESCE(cb.current_balance, 0))::NUMERIC(12,2) AS variance_amount,
  CASE
    WHEN COALESCE(cb.current_balance, 0) = 0 THEN 0
    ELSE ROUND(((COALESCE(v2.current_balance, 0) - cb.current_balance) / cb.current_balance) * 100, 4)
  END AS variance_percent
FROM public.contract_balances cb
LEFT JOIN public.v2_contract_balance_view v2 ON v2.contract_id = cb.contract_id;

GRANT SELECT ON public.v2_legacy_balance_variance_view TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_v2_loans_from_contracts(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_loan_id UUID;
  v_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT c.*
    FROM public.contracts c
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.v2_contract_loan_links l WHERE l.contract_id = c.id
      )
  LOOP
    INSERT INTO public.loans (
      tenant_id,
      customer_id,
      legacy_contract_id,
      loan_number,
      currency,
      principal_amount,
      disbursed_amount,
      apr_bps,
      term_months,
      payment_start_date,
      maturity_date,
      status,
      metadata
    ) VALUES (
      rec.tenant_id,
      rec.customer_id,
      rec.id,
      'LN-' || UPPER(SUBSTRING(rec.id::TEXT, 1, 8)),
      COALESCE(rec.currency, 'USD'),
      rec.total_price,
      rec.total_price,
      0,
      COALESCE(rec.term_months, 36),
      rec.payment_start_date,
      (rec.payment_start_date + (COALESCE(rec.term_months, 36) || ' months')::INTERVAL)::DATE,
      'active',
      jsonb_build_object('source', 'bootstrap_v2_loans_from_contracts')
    )
    RETURNING id INTO v_loan_id;

    INSERT INTO public.v2_contract_loan_links (tenant_id, contract_id, loan_id)
    VALUES (rec.tenant_id, rec.id, v_loan_id);

    PERFORM public.sync_v2_loan_balance(v_loan_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_v2_loans_from_contracts(UUID) TO service_role;
