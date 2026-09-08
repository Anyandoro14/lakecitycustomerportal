-- Weekly three-way balance reconciliation history (Sheets / Odoo / StandLedger)

CREATE TABLE IF NOT EXISTS public.balance_reconciliation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  as_of           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'completed',
  source          TEXT,
  sheets_label    TEXT,
  sheets_count    INTEGER NOT NULL DEFAULT 0,
  odoo_count      INTEGER NOT NULL DEFAULT 0,
  standledger_count INTEGER NOT NULL DEFAULT 0,
  stands_compared INTEGER NOT NULL DEFAULT 0,
  matched         INTEGER NOT NULL DEFAULT 0,
  variances       INTEGER NOT NULL DEFAULT 0,
  missing_source  INTEGER NOT NULL DEFAULT 0,
  positive_discrepancies INTEGER NOT NULL DEFAULT 0,
  negative_discrepancies INTEGER NOT NULL DEFAULT 0,
  abs_variance_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tolerance       NUMERIC(12,2) NOT NULL DEFAULT 0.01,
  email_to        TEXT[],
  email_sent      BOOLEAN NOT NULL DEFAULT FALSE,
  error           TEXT,
  notes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_reconciliation_runs_tenant_as_of
  ON public.balance_reconciliation_runs (tenant_id, as_of DESC);

CREATE TABLE IF NOT EXISTS public.balance_reconciliation_rows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES public.balance_reconciliation_runs(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stand_number    TEXT NOT NULL,
  customer_name   TEXT,
  status          TEXT NOT NULL,
  likely_source   TEXT,
  likely_cause    TEXT,
  sheets_price    NUMERIC(14,2),
  sheets_deposit  NUMERIC(14,2),
  sheets_paid     NUMERIC(14,2),
  sheets_balance  NUMERIC(14,2),
  odoo_price      NUMERIC(14,2),
  odoo_deposit    NUMERIC(14,2),
  odoo_paid       NUMERIC(14,2),
  odoo_balance    NUMERIC(14,2),
  standledger_price   NUMERIC(14,2),
  standledger_deposit NUMERIC(14,2),
  standledger_paid    NUMERIC(14,2),
  standledger_balance NUMERIC(14,2),
  sheets_vs_odoo      NUMERIC(14,2),
  sheets_vs_standledger NUMERIC(14,2),
  odoo_vs_standledger NUMERIC(14,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_reconciliation_rows_run
  ON public.balance_reconciliation_rows (run_id, status);
CREATE INDEX IF NOT EXISTS idx_balance_reconciliation_rows_stand
  ON public.balance_reconciliation_rows (tenant_id, stand_number);

ALTER TABLE public.balance_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_reconciliation_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_users_select_recon_runs"
  ON public.balance_reconciliation_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_users iu
      WHERE iu.user_id = auth.uid()
    )
  );

CREATE POLICY "internal_users_select_recon_rows"
  ON public.balance_reconciliation_rows
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_users iu
      WHERE iu.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.balance_reconciliation_runs TO authenticated, service_role;
GRANT SELECT ON public.balance_reconciliation_rows TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.balance_reconciliation_runs TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.balance_reconciliation_rows TO service_role;

-- Weekly Monday 04:00 UTC (06:00 CAT). Requires Vault secret reconciliation_cron_secret
-- and (optionally) app.balance_reconciliation_url. Skips quietly if the secret is missing.
CREATE OR REPLACE FUNCTION public.invoke_balance_reconciliation()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  req_id bigint;
  fn_url text;
  auth_token text;
BEGIN
  fn_url := NULLIF(current_setting('app.balance_reconciliation_url', true), '');
  IF fn_url IS NULL THEN
    fn_url := 'https://gumkxjeahojrcaqnosyz.supabase.co/functions/v1/reconcile-account-balances';
  END IF;

  BEGIN
    EXECUTE 'SELECT public.vault_read_secret($1)' INTO auth_token USING 'reconciliation_cron_secret';
  EXCEPTION WHEN undefined_function THEN
    auth_token := NULL;
  WHEN OTHERS THEN
    auth_token := NULL;
  END;

  IF auth_token IS NULL OR auth_token = '' THEN
    RAISE NOTICE 'Skipping weekly reconciliation: Vault secret reconciliation_cron_secret is not set';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_token
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'pg_cron')
  ) INTO req_id;

  RETURN req_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invoke_balance_reconciliation() TO postgres, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-balance-reconciliation') THEN
      PERFORM cron.unschedule('weekly-balance-reconciliation');
    END IF;

    PERFORM cron.schedule(
      'weekly-balance-reconciliation',
      '0 4 * * 1',
      $cron$SELECT public.invoke_balance_reconciliation();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule weekly-balance-reconciliation: %', SQLERRM;
END;
$$;
