-- Migration 003: RLS policies for tenant isolation

-- Helper function to extract tenant_id from JWT app_metadata
CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS UUID AS $$
  SELECT (auth.jwt()->'app_metadata'->>'tenant_id')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS and create tenant isolation policies on all tenant-scoped tables

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON profiles USING (tenant_id = auth.tenant_id());

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON payment_transactions USING (tenant_id = auth.tenant_id());

ALTER TABLE monthly_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON monthly_statements USING (tenant_id = auth.tenant_id());

ALTER TABLE internal_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON internal_users USING (tenant_id = auth.tenant_id());

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON audit_log USING (tenant_id = auth.tenant_id());

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON conversations USING (tenant_id = auth.tenant_id());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON messages USING (tenant_id = auth.tenant_id());

ALTER TABLE support_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON support_cases USING (tenant_id = auth.tenant_id());

ALTER TABLE customer_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_invitations USING (tenant_id = auth.tenant_id());

ALTER TABLE customer_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON customer_onboarding USING (tenant_id = auth.tenant_id());
