/*
  Run AFTER migrations 001-007 succeeded. Do NOT re-run 001-007 or 006 if tables already exist.

  Contents:
  - 20260402000001_payment_plans.sql  (contract columns, contract_balances view, index)
  - 20260402120000_ensure_lakecity_tenant.sql (lakecity tenant row)
*/

-- ---------- 20260402000001_payment_plans.sql ----------
-- Payment plan fields, balance view, and receipt lookup index (database-first dashboard)

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS term_months INTEGER NOT NULL DEFAULT 36;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS is_vat_inclusive BOOLEAN;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agreement_signed_seller BOOLEAN DEFAULT FALSE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agreement_signed_buyer BOOLEAN DEFAULT FALSE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agreement_file_url TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_stand_tenant_qc
  ON payment_receipts (stand_number, tenant_id, qc_status);

DROP VIEW IF EXISTS contract_balances;

CREATE VIEW contract_balances WITH (security_invoker = true) AS
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
  COALESCE(SUM(pr.amount) FILTER (WHERE pr.qc_status = 'approved'), 0)::numeric(12,2) AS total_paid,
  (c.total_price - COALESCE(SUM(pr.amount) FILTER (WHERE pr.qc_status = 'approved'), 0))::numeric(12,2) AS current_balance,
  ROUND(
    COALESCE(SUM(pr.amount) FILTER (WHERE pr.qc_status = 'approved'), 0) / NULLIF(c.total_price, 0) * 100, 1
  ) AS progress_percentage,
  COUNT(*) FILTER (WHERE pr.qc_status = 'approved')::integer AS payments_count,
  MAX(pr.payment_date) FILTER (WHERE pr.qc_status = 'approved') AS last_payment_date,
  (
    SELECT pr2.amount
    FROM payment_receipts pr2
    WHERE pr2.stand_number = c.stand_number
      AND pr2.tenant_id = c.tenant_id
      AND pr2.qc_status = 'approved'
    ORDER BY pr2.payment_date DESC NULLS LAST, pr2.created_at DESC
    LIMIT 1
  ) AS last_payment_amount
FROM contracts c
LEFT JOIN payment_receipts pr
  ON pr.stand_number = c.stand_number AND pr.tenant_id = c.tenant_id
GROUP BY c.id;

GRANT SELECT ON contract_balances TO authenticated, service_role;

-- ---------- 20260402120000_ensure_lakecity_tenant.sql ----------
-- Canonical org tenant is Lake City (slug: lakecity).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = 'lakecity') THEN
    UPDATE tenants
    SET display_name = 'Lake City', is_active = true
    WHERE slug = 'lakecity';
  ELSIF EXISTS (SELECT 1 FROM tenants WHERE slug = 'richcraft') THEN
    UPDATE tenants
    SET slug = 'lakecity', display_name = 'Lake City', is_active = true
    WHERE slug = 'richcraft';
  ELSE
    INSERT INTO tenants (slug, display_name, is_active)
    VALUES ('lakecity', 'Lake City', true);
  END IF;
END $$;
