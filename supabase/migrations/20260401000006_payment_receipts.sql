-- Migration 006: Create payment_receipts table for QC workflow

CREATE TABLE payment_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  stand_number      TEXT NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  payment_date      DATE NOT NULL,
  gateway           TEXT NOT NULL DEFAULT 'manual',
  gateway_reference TEXT,
  gateway_metadata  JSONB DEFAULT '{}',
  receipt_file_url  TEXT,
  qc_status         TEXT NOT NULL DEFAULT 'pending_qc',
  qc_reviewer_id    UUID REFERENCES internal_users(id),
  qc_reviewed_at    TIMESTAMPTZ,
  qc_notes          TEXT,
  odoo_payment_id   INTEGER,
  odoo_sync_status  TEXT DEFAULT 'pending',
  created_by        UUID REFERENCES internal_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payment_receipts_tenant ON payment_receipts(tenant_id);
CREATE INDEX idx_payment_receipts_stand ON payment_receipts(stand_number);
CREATE INDEX idx_payment_receipts_qc_status ON payment_receipts(qc_status);
CREATE INDEX idx_payment_receipts_created_at ON payment_receipts(created_at DESC);

-- RLS
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON payment_receipts USING (tenant_id = auth.tenant_id());
