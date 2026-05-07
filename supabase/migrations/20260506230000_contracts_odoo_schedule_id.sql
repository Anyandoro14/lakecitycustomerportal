-- Link Supabase contracts to the Odoo Lakecity CRM schedule
-- (lakecity.collection.schedule.id), set by the odoo-push-schedule edge fn.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS odoo_schedule_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_contracts_odoo_schedule
  ON contracts(odoo_schedule_id)
  WHERE odoo_schedule_id IS NOT NULL;

COMMENT ON COLUMN contracts.odoo_schedule_id IS
  'lakecity.collection.schedule.id in Odoo, populated by odoo-push-schedule edge function.';
