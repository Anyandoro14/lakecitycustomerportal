-- Track the Odoo lakecity.collection.payment line that produced a receipt.
-- Used by the odoo-webhook handler for `_model = lakecity.collection.payment`
-- to keep ingest idempotent and to support the internal /internal/odoo-audit
-- page (which lists recent Odoo→Supabase syncs).
--
-- Distinct from `odoo_payment_id` (which referenced legacy account.payment).
-- Older receipts may have only `odoo_payment_id` set; new receipts ingested
-- post-cutover will have `odoo_collection_payment_id` set instead.

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS odoo_collection_payment_id INTEGER;

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS odoo_collection_schedule_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_odoo_collection_payment
  ON payment_receipts(tenant_id, odoo_collection_payment_id)
  WHERE odoo_collection_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_odoo_collection_schedule
  ON payment_receipts(odoo_collection_schedule_id)
  WHERE odoo_collection_schedule_id IS NOT NULL;

COMMENT ON COLUMN payment_receipts.odoo_collection_payment_id IS
  'lakecity.collection.payment.id in Odoo (one row per monthly cell), populated by odoo-webhook on the lakecity.collection.payment branch.';

COMMENT ON COLUMN payment_receipts.odoo_collection_schedule_id IS
  'lakecity.collection.schedule.id (parent of the payment line) for fast joins to contracts.odoo_schedule_id.';
