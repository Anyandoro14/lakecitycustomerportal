-- Paynow checkout: unique gateway references for idempotent receipt writes
-- and faster lookup of in-flight Paynow sessions.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_paynow_reference
  ON payment_receipts (tenant_id, gateway_reference)
  WHERE gateway = 'paynow' AND gateway_reference IS NOT NULL AND gateway_reference <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_paynow_reference
  ON payment_transactions (gateway, gateway_reference)
  WHERE gateway = 'paynow' AND gateway_reference IS NOT NULL;

COMMENT ON COLUMN tenants.payment_gateway IS
  'Active collection gateway: manual | kuva | paynow';
