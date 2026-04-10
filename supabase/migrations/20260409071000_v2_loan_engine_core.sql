-- V2 loan engine and accounting backbone (additive only).

CREATE TYPE public.loan_rate_model AS ENUM ('flat', 'reducing_balance', 'zero_interest');
CREATE TYPE public.loan_status AS ENUM ('draft', 'active', 'restructured', 'closed', 'written_off', 'defaulted');
CREATE TYPE public.schedule_status AS ENUM ('pending', 'partial', 'paid', 'waived', 'overdue');
CREATE TYPE public.loan_event_type AS ENUM (
  'LOAN_CREATED',
  'DISBURSED',
  'PAYMENT_POSTED',
  'PAYMENT_REVERSED',
  'FEE_APPLIED',
  'INTEREST_ACCRUED',
  'RESTRUCTURED',
  'WRITE_OFF',
  'STATUS_CHANGED'
);

CREATE TABLE IF NOT EXISTS public.loan_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  min_term_months INTEGER NOT NULL DEFAULT 1,
  max_term_months INTEGER NOT NULL DEFAULT 240,
  apr_bps INTEGER NOT NULL DEFAULT 0,
  rate_model public.loan_rate_model NOT NULL DEFAULT 'zero_interest',
  late_fee_bps INTEGER NOT NULL DEFAULT 0,
  tax_bps INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.profiles(id),
  product_id UUID REFERENCES public.loan_products(id),
  external_reference TEXT,
  requested_principal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  requested_term_months INTEGER NOT NULL DEFAULT 36,
  requested_apr_bps INTEGER NOT NULL DEFAULT 0,
  decision_status TEXT NOT NULL DEFAULT 'submitted' CHECK (decision_status IN ('submitted', 'approved', 'declined', 'cancelled')),
  decision_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.loan_applications(id),
  customer_id UUID NOT NULL REFERENCES public.profiles(id),
  product_id UUID REFERENCES public.loan_products(id),
  legacy_contract_id UUID UNIQUE REFERENCES public.contracts(id),
  loan_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  principal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  disbursed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  apr_bps INTEGER NOT NULL DEFAULT 0,
  term_months INTEGER NOT NULL DEFAULT 36,
  origination_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_start_date DATE NOT NULL,
  maturity_date DATE,
  status public.loan_status NOT NULL DEFAULT 'draft',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, loan_number)
);

CREATE TABLE IF NOT EXISTS public.v2_contract_loan_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL UNIQUE REFERENCES public.contracts(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL UNIQUE REFERENCES public.loans(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.loan_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL,
  due_date DATE NOT NULL,
  opening_principal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_principal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_interest NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_fees NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_total NUMERIC(14, 2) GENERATED ALWAYS AS (due_principal + due_interest + due_fees + due_tax) STORED,
  paid_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.schedule_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (loan_id, installment_no)
);

CREATE TABLE IF NOT EXISTS public.loan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  event_type public.loan_event_type NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'system',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.loan_balances (
  loan_id UUID PRIMARY KEY REFERENCES public.loans(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  principal_outstanding NUMERIC(14, 2) NOT NULL DEFAULT 0,
  accrued_interest NUMERIC(14, 2) NOT NULL DEFAULT 0,
  accrued_fees NUMERIC(14, 2) NOT NULL DEFAULT 0,
  accrued_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  arrears_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_due_now NUMERIC(14, 2) NOT NULL DEFAULT 0,
  next_due_date DATE,
  days_past_due INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.loan_schedules(id) ON DELETE SET NULL,
  payment_receipt_id UUID REFERENCES public.payment_receipts(id) ON DELETE SET NULL,
  payment_transaction_id UUID,
  allocated_principal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  allocated_interest NUMERIC(14, 2) NOT NULL DEFAULT 0,
  allocated_fees NUMERIC(14, 2) NOT NULL DEFAULT 0,
  allocated_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  allocated_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    allocated_principal + allocated_interest + allocated_fees + allocated_tax
  ) STORED,
  allocation_method TEXT NOT NULL DEFAULT 'waterfall',
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.delinquency_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  dpd INTEGER NOT NULL DEFAULT 0,
  bucket TEXT NOT NULL DEFAULT 'current',
  promise_to_pay_date DATE,
  assigned_to UUID REFERENCES public.internal_users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'watch', 'resolved', 'written_off')),
  last_contact_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  currency TEXT NOT NULL DEFAULT 'USD',
  odoo_account_id INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_code)
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  loan_event_id UUID REFERENCES public.loan_events(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES public.ledger_accounts(id),
  entry_side TEXT NOT NULL CHECK (entry_side IN ('debit', 'credit')),
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'staging' CHECK (environment IN ('dev', 'staging', 'prod')),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reconciliation_run_id UUID NOT NULL REFERENCES public.reconciliation_runs(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  expected_amount NUMERIC(14, 2),
  actual_amount NUMERIC(14, 2),
  variance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.odoo_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  local_id UUID NOT NULL,
  odoo_model TEXT NOT NULL,
  odoo_id INTEGER NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_type, local_id),
  UNIQUE (tenant_id, odoo_model, odoo_id)
);

CREATE TABLE IF NOT EXISTS public.odoo_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.odoo_sync_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES public.odoo_sync_queue(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT FALSE,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_loans_tenant_customer ON public.loans (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_loan_due_date ON public.loan_schedules (loan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_loan_events_tenant_loan ON public.loan_events (tenant_id, loan_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_balances_tenant_due ON public.loan_balances (tenant_id, next_due_date);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_lookup ON public.payment_allocations (tenant_id, loan_id, allocated_at DESC);
CREATE INDEX IF NOT EXISTS idx_delinquency_cases_lookup ON public.delinquency_cases (tenant_id, status, dpd);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_lookup ON public.ledger_entries (tenant_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_lookup ON public.reconciliation_items (tenant_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_queue_lookup ON public.odoo_sync_queue (tenant_id, status, next_attempt_at);

ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_contract_loan_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delinquency_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odoo_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odoo_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odoo_sync_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.loan_products;
CREATE POLICY tenant_isolation ON public.loan_products USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.loan_applications;
CREATE POLICY tenant_isolation ON public.loan_applications USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.loans;
CREATE POLICY tenant_isolation ON public.loans USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.v2_contract_loan_links;
CREATE POLICY tenant_isolation ON public.v2_contract_loan_links USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.loan_schedules;
CREATE POLICY tenant_isolation ON public.loan_schedules USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.loan_events;
CREATE POLICY tenant_isolation ON public.loan_events USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.loan_balances;
CREATE POLICY tenant_isolation ON public.loan_balances USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.payment_allocations;
CREATE POLICY tenant_isolation ON public.payment_allocations USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.delinquency_cases;
CREATE POLICY tenant_isolation ON public.delinquency_cases USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.ledger_accounts;
CREATE POLICY tenant_isolation ON public.ledger_accounts USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.ledger_entries;
CREATE POLICY tenant_isolation ON public.ledger_entries USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.reconciliation_runs;
CREATE POLICY tenant_isolation ON public.reconciliation_runs USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.reconciliation_items;
CREATE POLICY tenant_isolation ON public.reconciliation_items USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.odoo_entity_links;
CREATE POLICY tenant_isolation ON public.odoo_entity_links USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.odoo_sync_queue;
CREATE POLICY tenant_isolation ON public.odoo_sync_queue USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.odoo_sync_attempts;
CREATE POLICY tenant_isolation ON public.odoo_sync_attempts USING (tenant_id = public.jwt_tenant_id());

CREATE OR REPLACE FUNCTION public.sync_v2_loan_balance(p_loan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_principal NUMERIC(14,2);
  v_interest NUMERIC(14,2);
  v_fees NUMERIC(14,2);
  v_tax NUMERIC(14,2);
  v_due_now NUMERIC(14,2);
  v_next_due DATE;
  v_dpd INTEGER;
BEGIN
  SELECT l.tenant_id
    INTO v_tenant_id
  FROM public.loans l
  WHERE l.id = p_loan_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    GREATEST(COALESCE(SUM(ls.due_principal),0) - COALESCE(SUM(pa.allocated_principal),0), 0),
    GREATEST(COALESCE(SUM(ls.due_interest),0) - COALESCE(SUM(pa.allocated_interest),0), 0),
    GREATEST(COALESCE(SUM(ls.due_fees),0) - COALESCE(SUM(pa.allocated_fees),0), 0),
    GREATEST(COALESCE(SUM(ls.due_tax),0) - COALESCE(SUM(pa.allocated_tax),0), 0)
  INTO v_principal, v_interest, v_fees, v_tax
  FROM public.loan_schedules ls
  LEFT JOIN public.payment_allocations pa ON pa.schedule_id = ls.id
  WHERE ls.loan_id = p_loan_id;

  SELECT
    MIN(ls.due_date),
    GREATEST((CURRENT_DATE - MIN(ls.due_date)), 0)::INTEGER,
    COALESCE(SUM(GREATEST(ls.due_total - ls.paid_total, 0)), 0)
  INTO v_next_due, v_dpd, v_due_now
  FROM public.loan_schedules ls
  WHERE ls.loan_id = p_loan_id
    AND ls.status IN ('pending', 'partial', 'overdue');

  INSERT INTO public.loan_balances (
    loan_id, tenant_id, principal_outstanding, accrued_interest, accrued_fees, accrued_tax,
    arrears_amount, total_due_now, next_due_date, days_past_due, updated_at
  )
  VALUES (
    p_loan_id, v_tenant_id, COALESCE(v_principal, 0), COALESCE(v_interest, 0), COALESCE(v_fees, 0), COALESCE(v_tax, 0),
    COALESCE(v_due_now, 0), COALESCE(v_due_now, 0), v_next_due, COALESCE(v_dpd, 0), NOW()
  )
  ON CONFLICT (loan_id) DO UPDATE
    SET principal_outstanding = EXCLUDED.principal_outstanding,
        accrued_interest = EXCLUDED.accrued_interest,
        accrued_fees = EXCLUDED.accrued_fees,
        accrued_tax = EXCLUDED.accrued_tax,
        arrears_amount = EXCLUDED.arrears_amount,
        total_due_now = EXCLUDED.total_due_now,
        next_due_date = EXCLUDED.next_due_date,
        days_past_due = EXCLUDED.days_past_due,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_v2_loan_balance(UUID) TO service_role;
