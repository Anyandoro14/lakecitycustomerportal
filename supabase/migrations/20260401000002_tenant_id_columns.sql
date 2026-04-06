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

-- Backfill all existing rows with Richcraft tenant_id
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
