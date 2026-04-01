-- Migration 001: Create tenants table for multi-tenancy support
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  spreadsheet_id  TEXT,
  logo_url        TEXT,
  primary_color   TEXT DEFAULT '#1a1a2e',
  support_email   TEXT,
  payment_gateway TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'kuva'
  crm_provider    TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'odoo'
  odoo_company_id INTEGER,
  odoo_journal_id INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Richcraft as the first tenant
INSERT INTO tenants (slug, display_name) VALUES ('richcraft', 'Richcraft');
