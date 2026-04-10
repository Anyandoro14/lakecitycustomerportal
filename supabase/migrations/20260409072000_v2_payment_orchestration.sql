-- V2 payment orchestration model + dual-write bridge from legacy receipts.

CREATE TYPE public.payment_transaction_state AS ENUM (
  'initialized',
  'authorized',
  'captured',
  'settled',
  'failed',
  'reversed'
);

CREATE TABLE IF NOT EXISTS public.payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL CHECK (provider_code IN ('kuva', 'paystack', 'paypal', 'flutterwave', 'manual', 'odoo')),
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_path TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider_code)
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.payment_providers(id),
  method_type TEXT NOT NULL,
  masked_details TEXT,
  token_reference TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  purpose TEXT NOT NULL DEFAULT 'loan_repayment',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  external_reference TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.payment_transactions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  payment_receipt_id UUID REFERENCES public.payment_receipts(id) ON DELETE SET NULL,
  provider_code TEXT NOT NULL,
  state public.payment_transaction_state NOT NULL DEFAULT 'initialized',
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider_event_id TEXT,
  provider_reference TEXT,
  idempotency_key TEXT,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, provider_code, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')),
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, provider_code, provider_event_id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.payout_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL,
  settlement_reference TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  gross_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'reversed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider_code, settlement_reference)
);

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT fk_payment_allocations_tx
  FOREIGN KEY (payment_transaction_id)
  REFERENCES public.payment_transactions_v2(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_providers_lookup ON public.payment_providers (tenant_id, provider_code, is_enabled);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_v2_lookup ON public.payment_transactions_v2 (tenant_id, loan_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_lookup ON public.payment_webhook_events (tenant_id, provider_code, processing_status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_lookup ON public.payment_intents (tenant_id, status, created_at DESC);

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.payment_providers;
CREATE POLICY tenant_isolation ON public.payment_providers USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.payment_methods;
CREATE POLICY tenant_isolation ON public.payment_methods USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.payment_intents;
CREATE POLICY tenant_isolation ON public.payment_intents USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.payment_transactions_v2;
CREATE POLICY tenant_isolation ON public.payment_transactions_v2 USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.payment_webhook_events;
CREATE POLICY tenant_isolation ON public.payment_webhook_events USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.payout_settlements;
CREATE POLICY tenant_isolation ON public.payout_settlements USING (tenant_id = public.jwt_tenant_id());

CREATE OR REPLACE FUNCTION public.get_active_loan_by_stand(
  p_tenant_id UUID,
  p_stand_number TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(v2.loan_id, l.id)
  FROM public.contracts c
  LEFT JOIN public.v2_contract_loan_links v2 ON v2.contract_id = c.id
  LEFT JOIN public.loans l ON l.legacy_contract_id = c.id
  WHERE c.tenant_id = p_tenant_id
    AND UPPER(c.stand_number) = UPPER(p_stand_number)
    AND c.status = 'active'
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.dual_write_payment_receipt_to_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_loan_id UUID;
  v_tx_id UUID;
  v_idempotency_key TEXT;
  v_schedule_id UUID;
BEGIN
  v_enabled := public.is_feature_enabled(NEW.tenant_id, 'v2_dual_write_enabled', 'prod');
  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  v_idempotency_key := 'receipt:' || NEW.id::TEXT;
  v_loan_id := public.get_active_loan_by_stand(NEW.tenant_id, NEW.stand_number);

  INSERT INTO public.payment_transactions_v2 (
    tenant_id,
    loan_id,
    payment_receipt_id,
    provider_code,
    state,
    amount,
    currency,
    provider_reference,
    idempotency_key,
    metadata,
    occurred_at
  )
  VALUES (
    NEW.tenant_id,
    v_loan_id,
    NEW.id,
    COALESCE(NULLIF(NEW.gateway, ''), 'manual'),
    CASE WHEN NEW.qc_status = 'approved' THEN 'captured'::public.payment_transaction_state ELSE 'initialized'::public.payment_transaction_state END,
    NEW.amount,
    'USD',
    NEW.gateway_reference,
    v_idempotency_key,
    COALESCE(NEW.gateway_metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (tenant_id, idempotency_key)
  DO UPDATE SET
    state = EXCLUDED.state,
    amount = EXCLUDED.amount,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_tx_id;

  IF v_loan_id IS NOT NULL THEN
    INSERT INTO public.loan_events (
      tenant_id, loan_id, event_type, event_at, amount, currency, source, idempotency_key, metadata
    ) VALUES (
      NEW.tenant_id,
      v_loan_id,
      CASE WHEN NEW.qc_status = 'approved' THEN 'PAYMENT_POSTED'::public.loan_event_type ELSE 'STATUS_CHANGED'::public.loan_event_type END,
      COALESCE(NEW.created_at, NOW()),
      NEW.amount,
      'USD',
      COALESCE(NULLIF(NEW.gateway, ''), 'manual'),
      'loan-event:' || NEW.id::TEXT,
      jsonb_build_object('receipt_id', NEW.id, 'qc_status', NEW.qc_status)
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

    IF NEW.qc_status = 'approved' THEN
      SELECT ls.id
      INTO v_schedule_id
      FROM public.loan_schedules ls
      WHERE ls.loan_id = v_loan_id
        AND ls.status IN ('pending', 'partial', 'overdue')
      ORDER BY ls.due_date ASC
      LIMIT 1;

      INSERT INTO public.payment_allocations (
        tenant_id,
        loan_id,
        schedule_id,
        payment_receipt_id,
        payment_transaction_id,
        allocated_principal,
        idempotency_key
      ) VALUES (
        NEW.tenant_id,
        v_loan_id,
        v_schedule_id,
        NEW.id,
        v_tx_id,
        NEW.amount,
        'allocation:' || NEW.id::TEXT
      )
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

      IF v_schedule_id IS NOT NULL THEN
        UPDATE public.loan_schedules
        SET
          paid_total = paid_total + NEW.amount,
          status = CASE
            WHEN (paid_total + NEW.amount) >= due_total THEN 'paid'::public.schedule_status
            WHEN (paid_total + NEW.amount) > 0 THEN 'partial'::public.schedule_status
            ELSE status
          END,
          paid_at = CASE WHEN (paid_total + NEW.amount) >= due_total THEN NOW() ELSE paid_at END
        WHERE id = v_schedule_id;
      END IF;

      PERFORM public.sync_v2_loan_balance(v_loan_id);
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block legacy payment receipt inserts during dual-write rollout.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dual_write_payment_receipt_to_v2 ON public.payment_receipts;
CREATE TRIGGER trg_dual_write_payment_receipt_to_v2
AFTER INSERT ON public.payment_receipts
FOR EACH ROW
EXECUTE FUNCTION public.dual_write_payment_receipt_to_v2();
