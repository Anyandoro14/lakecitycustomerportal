
-- Payment transactions table for Mugonat gateway integration
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_number text NOT NULL,
  customer_email text,
  customer_name text,
  amount_usd numeric NOT NULL,
  amount_local numeric,
  local_currency text DEFAULT 'USD',
  gateway text NOT NULL DEFAULT 'mugonat',
  gateway_reference text,
  gateway_checkout_url text,
  status text NOT NULL DEFAULT 'pending',
  settlement_status text DEFAULT 'unsettled',
  ledger_cell text,
  ledger_written_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  user_id uuid
);

-- Index for fast lookups
CREATE INDEX idx_payment_transactions_stand ON public.payment_transactions(stand_number);
CREATE INDEX idx_payment_transactions_gateway_ref ON public.payment_transactions(gateway_reference);
CREATE INDEX idx_payment_transactions_status ON public.payment_transactions(status);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Customers can view their own transactions
CREATE POLICY "Users can view own payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (stand_number = get_user_stand_number(auth.uid()));

-- Internal users can view all transactions
CREATE POLICY "Internal users can view all payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (is_internal_user(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER set_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
