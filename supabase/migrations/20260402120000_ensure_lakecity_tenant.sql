-- Canonical org tenant is Lake City (slug: lakecity). "Richcraft" is a customer category, not the tenant slug.
-- Safe for DBs that only have richcraft, only have lakecity, have neither, or already have lakecity.

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
