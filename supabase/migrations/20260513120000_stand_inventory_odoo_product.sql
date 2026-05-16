-- Link each stand row to Odoo product.template / product.product created via lakecity API

ALTER TABLE public.stand_inventory
  ADD COLUMN IF NOT EXISTS odoo_product_tmpl_id INTEGER,
  ADD COLUMN IF NOT EXISTS odoo_product_id INTEGER,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.stand_inventory.odoo_product_tmpl_id IS 'Odoo product.template id for this stand (Sales/Inventory)';
COMMENT ON COLUMN public.stand_inventory.odoo_product_id IS 'Odoo product.product variant id (stock moves)';
COMMENT ON COLUMN public.stand_inventory.odoo_synced_at IS 'Last successful push to Odoo stand product API';
