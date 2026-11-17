-- iVeri Lite (CBZ) card payments: orders + per-stand sequence. STAGING FIRST.
-- Nothing here posts to balances: approvals are recorded as pending reconciliation.
CREATE TABLE IF NOT EXISTS public.iveri_card_orders (
  reference        text PRIMARY KEY,               -- ST<stand>-<seq> (Ecom_ConsumerOrderID)
  trace            text NOT NULL UNIQUE,           -- Lite_Merchant_Trace
  nonce            text NOT NULL,                  -- LC_Nonce echoed back by iVeri
  stand_number     text NOT NULL,
  amount_cents     integer NOT NULL CHECK (amount_cents > 0),
  currency         text NOT NULL DEFAULT 'USD',
  env              text NOT NULL CHECK (env IN ('test','live')),
  state            text NOT NULL DEFAULT 'initiated' CHECK (state IN
                   ('initiated','approved_pending_recon','declined','trylater','error','cancelled','abandoned','amount_mismatch')),
  idempotency_key  text NOT NULL UNIQUE,
  billing          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- email/name/phone the customer typed (no card data)
  result           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- safe fields only: status, auth code, bank ref, index, masked PAN
  odoo_intake_id   text,
  flags            text[] NOT NULL DEFAULT '{}',
  user_id          uuid,
  tenant_id        uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iveri_orders_state_created ON public.iveri_card_orders (state, created_at);
CREATE INDEX IF NOT EXISTS idx_iveri_orders_stand ON public.iveri_card_orders (stand_number);

CREATE TABLE IF NOT EXISTS public.iveri_stand_seq (stand_number text PRIMARY KEY, last_seq integer NOT NULL DEFAULT 0);

CREATE OR REPLACE FUNCTION public.iveri_next_seq(p_stand text) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.iveri_stand_seq AS s (stand_number, last_seq) VALUES (p_stand, 1)
  ON CONFLICT (stand_number) DO UPDATE SET last_seq = s.last_seq + 1
  RETURNING last_seq;
$$;
REVOKE ALL ON FUNCTION public.iveri_next_seq(text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.iveri_card_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iveri_stand_seq ENABLE ROW LEVEL SECURITY;
-- Customers may read their own orders (result pages); all writes go through service-role edge functions.
CREATE POLICY "iveri orders: owner can read" ON public.iveri_card_orders FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Sweep schedule (apply on Staging only after review; needs pg_cron + pg_net):
-- SELECT cron.schedule('iveri-sweep-15m', '*/15 * * * *', $$ SELECT net.http_post(
--   url := '<SUPABASE_URL>/functions/v1/iveri-sweep',
--   headers := jsonb_build_object('Authorization', 'Bearer ' || <service role from vault>)) $$);
