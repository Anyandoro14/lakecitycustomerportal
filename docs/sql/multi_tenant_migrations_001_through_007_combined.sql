/*
  Multi-tenant migrations 001 through 007 (one paste).
  Run ONCE on an empty / not-yet-migrated database. Requires base tables:
  profiles, payment_transactions, etc.

  If you already ran this successfully, DO NOT run it again — you will get
  "relation already exists". Next step only:
  docs/sql/migrations_008_and_009_after_007_combined.sql

  Paste from this .sql file only (plain text). If the editor shows "ABLE"
  instead of "ALTER TABLE", clear the editor and paste again - do not copy from PDF.
*/

-- Fail fast with a clear message if 001-007 was already applied (avoids 42P07 mid-script).
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    RAISE EXCEPTION 'Migrations 001-007 already applied: public.tenants exists. Do not re-run this file. Next: docs/sql/migrations_008_and_009_after_007_combined.sql';
  END IF;
END $$;

-- ---------- 20260401000001_tenants.sql ----------
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

-- Seed Lake City as the first tenant (slug used by app routing; Richcraft is a customer type, not the tenant)
INSERT INTO tenants (slug, display_name) VALUES ('lakecity', 'Lake City');

-- ---------- 20260401000002_tenant_id_columns.sql ----------
-- Migration 002: Add tenant_id to all tenant-scoped tables and backfill with Richcraft

-- Add nullable tenant_id columns first
ALTER TABLE profiles ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE payment_transactions ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE monthly_statements ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE internal_users ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE audit_log ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE conversations ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE messages ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE support_cases ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE customer_invitations ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE customer_onboarding ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Backfill all existing rows with lakecity tenant_id
UPDATE profiles SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE payment_transactions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE monthly_statements SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE internal_users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE audit_log SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE conversations SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE messages SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE support_cases SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE customer_invitations SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');
UPDATE customer_onboarding SET tenant_id = (SELECT id FROM tenants WHERE slug = 'lakecity');

-- Now enforce NOT NULL
ALTER TABLE profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payment_transactions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE monthly_statements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE internal_users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE support_cases ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE customer_invitations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE customer_onboarding ALTER COLUMN tenant_id SET NOT NULL;

-- Add indexes for tenant_id lookups
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_payment_transactions_tenant ON payment_transactions(tenant_id);
CREATE INDEX idx_monthly_statements_tenant ON monthly_statements(tenant_id);
CREATE INDEX idx_internal_users_tenant ON internal_users(tenant_id);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_support_cases_tenant ON support_cases(tenant_id);
CREATE INDEX idx_customer_invitations_tenant ON customer_invitations(tenant_id);
CREATE INDEX idx_customer_onboarding_tenant ON customer_onboarding(tenant_id);

-- ---------- 20260401000003_rls_policies.sql ----------
-- Migration 003: RLS policies for tenant isolation (public helper — see SUPABASE_DEPLOY_RUNBOOK)

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt()->'app_metadata'->>'tenant_id')::uuid;
$$;

GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated, anon, service_role;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON profiles USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON payment_transactions USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE monthly_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON monthly_statements USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE internal_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON internal_users USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON audit_log USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON conversations USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON messages USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE support_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON support_cases USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE customer_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_invitations USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE customer_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_onboarding USING (tenant_id = public.jwt_tenant_id());

-- ---------- 20260401000004_auth_hook.sql ----------
-- Migration 004: Auth hook to inject tenant_id, role, internal_role into JWT app_metadata on login

CREATE OR REPLACE FUNCTION public.handle_auth_login()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
  _role TEXT;
  _internal_role TEXT;
  _meta JSONB;
BEGIN
  -- Check if user is an internal user first
  SELECT iu.tenant_id, iu.role INTO _tenant_id, _internal_role
  FROM internal_users iu
  WHERE iu.user_id = NEW.id
  LIMIT 1;

  IF _tenant_id IS NOT NULL THEN
    _role := 'internal';
  ELSE
    -- Check profiles table for customer
    SELECT p.tenant_id INTO _tenant_id
    FROM profiles p
    WHERE p.id = NEW.id
    LIMIT 1;

    _role := 'customer';
    _internal_role := NULL;
  END IF;

  -- Build metadata payload
  _meta := COALESCE(NEW.raw_app_meta_data, '{}'::JSONB);
  _meta := _meta || jsonb_build_object(
    'tenant_id', _tenant_id,
    'role', _role,
    'internal_role', _internal_role
  );

  -- Update the user's app_metadata
  NEW.raw_app_meta_data := _meta;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users for login (update of last_sign_in_at)
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  BEFORE UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_login();

-- Also fire on initial creation so first login has metadata
DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_login();

-- ---------- 20260401000005_contracts_installments.sql ----------
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
CREATE POLICY "tenant_isolation" ON contracts USING (tenant_id = public.jwt_tenant_id());

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON installments USING (tenant_id = public.jwt_tenant_id());

-- ---------- 20260401000006_payment_receipts.sql ----------
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
CREATE POLICY "tenant_isolation" ON payment_receipts USING (tenant_id = public.jwt_tenant_id());

-- ---------- 20260401000007_odoo_kuva_fields.sql ----------
-- Migration 007: Add Odoo and Kuva integration fields to existing tables

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS odoo_sync_status TEXT DEFAULT 'pending';

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS gateway_metadata JSONB DEFAULT '{}';

-- END 001-007. Next (separate run): 20260402000001_payment_plans.sql,
-- 20260402120000_ensure_lakecity_tenant.sql (see docs/SUPABASE_DEPLOY_RUNBOOK.md)
