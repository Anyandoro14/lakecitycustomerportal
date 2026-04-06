-- Migration 005: Create contracts and installments tables

CREATE TABLE contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  customer_id         UUID NOT NULL REFERENCES profiles(id),
  odoo_sale_order_id  INTEGER UNIQUE,
  stand_number        TEXT NOT NULL,
  total_price         NUMERIC(12,2) NOT NULL,
  monthly_installment NUMERIC(12,2) NOT NULL,
  payment_start_date  DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE installments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  contract_id     UUID NOT NULL REFERENCES contracts(id),
  installment_no  INTEGER NOT NULL,
  due_date        DATE NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  odoo_invoice_id INTEGER,
  synced_at       TIMESTAMPTZ,
  UNIQUE (contract_id, installment_no)
);

-- Indexes
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_customer ON contracts(customer_id);
CREATE INDEX idx_contracts_stand ON contracts(stand_number);
CREATE INDEX idx_installments_tenant ON installments(tenant_id);
CREATE INDEX idx_installments_contract ON installments(contract_id);
CREATE INDEX idx_installments_due_date ON installments(due_date);

-- RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON contracts USING (tenant_id = auth.tenant_id());

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON installments USING (tenant_id = auth.tenant_id());
