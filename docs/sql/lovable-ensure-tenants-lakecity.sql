-- Run this in Lovable Cloud → Database → SQL editor (one shot, safe to re-run).
-- Fixes: Tenant "lakecity" not found — creates public.tenants if missing and ensures slug lakecity.

CREATE TABLE IF NOT EXISTS public.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  spreadsheet_id  TEXT,
  logo_url        TEXT,
  primary_color   TEXT DEFAULT '#1a1a2e',
  support_email   TEXT,
  payment_gateway TEXT NOT NULL DEFAULT 'manual',
  crm_provider    TEXT NOT NULL DEFAULT 'internal',
  odoo_company_id INTEGER,
  odoo_journal_id INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'lakecity') THEN
    UPDATE public.tenants
    SET display_name = 'Lake City', is_active = true
    WHERE slug = 'lakecity';
  ELSIF EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'richcraft') THEN
    UPDATE public.tenants
    SET slug = 'lakecity', display_name = 'Lake City', is_active = true
    WHERE slug = 'richcraft';
  ELSE
    INSERT INTO public.tenants (slug, display_name, is_active)
    VALUES ('lakecity', 'Lake City', true);
  END IF;
END $$;

-- Optional: confirm row exists
-- SELECT id, slug, display_name, is_active FROM public.tenants;
