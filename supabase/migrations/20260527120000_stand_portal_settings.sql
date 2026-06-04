-- Per-stand Customer Portal enrolment and deposit settings (synced from Odoo lakecity.loan.contract)

CREATE TABLE IF NOT EXISTS stand_portal_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stand_number        TEXT NOT NULL,
  portal_enrolled     BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_required    BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_split_three BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_due_date    DATE,
  deposit_date_1      DATE,
  deposit_date_2      DATE,
  deposit_date_3      DATE,
  deposit_amount      NUMERIC(12,2) DEFAULT 0,
  payment_start_date  DATE,
  term_months         INTEGER,
  odoo_contract_id    INTEGER,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, stand_number)
);

CREATE INDEX IF NOT EXISTS idx_stand_portal_settings_tenant ON stand_portal_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stand_portal_settings_enrolled
  ON stand_portal_settings(tenant_id, portal_enrolled)
  WHERE portal_enrolled = TRUE;

ALTER TABLE stand_portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stand_portal_settings
  USING (tenant_id = public.jwt_tenant_id());

-- Grandfather: existing profile stands are treated as enrolled until Odoo sync updates them
INSERT INTO stand_portal_settings (tenant_id, stand_number, portal_enrolled, synced_at)
SELECT DISTINCT p.tenant_id, UPPER(TRIM(p.stand_number)), TRUE, NOW()
FROM profiles p
WHERE p.stand_number IS NOT NULL
  AND TRIM(p.stand_number) <> ''
ON CONFLICT (tenant_id, stand_number) DO UPDATE SET
  portal_enrolled = EXCLUDED.portal_enrolled OR stand_portal_settings.portal_enrolled,
  synced_at = NOW(),
  updated_at = NOW();
