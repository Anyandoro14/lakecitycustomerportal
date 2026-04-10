-- V2 CRM core schema for standalone app operation.

CREATE TABLE IF NOT EXISTS public.crm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'customer' CHECK (type IN ('lead', 'customer', 'partner', 'vendor')),
  lifecycle_stage TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_stage IN ('prospect', 'active', 'churn_risk', 'inactive')),
  owner_user_id UUID REFERENCES public.internal_users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_number)
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role_title TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  source TEXT,
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'nurturing', 'converted', 'lost')),
  score INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  owner_user_id UUID REFERENCES public.internal_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'qualification' CHECK (stage IN ('qualification', 'proposal', 'underwriting', 'commit', 'won', 'lost')),
  expected_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  close_probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  expected_close_date DATE,
  owner_user_id UUID REFERENCES public.internal_users(id),
  loss_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  case_id UUID,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call', 'email', 'sms', 'whatsapp', 'task', 'note', 'meeting')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  body TEXT,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES public.internal_users(id),
  external_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_support_case_id UUID REFERENCES public.support_cases(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  case_number TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending_customer', 'resolved', 'closed')),
  sla_due_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.internal_users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, case_number)
);

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'mixed')),
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed')),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.crm_campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'opened', 'clicked', 'responded', 'opted_out')),
  last_activity_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_accounts_tenant_stage ON public.crm_accounts (tenant_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant_email ON public.crm_contacts (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_status ON public.crm_leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_tenant_stage ON public.crm_opportunities (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_activities_tenant_type ON public.crm_activities (tenant_id, activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_cases_tenant_status ON public.crm_cases (tenant_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_members_lookup ON public.crm_campaign_members (tenant_id, campaign_id, status);

ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.crm_accounts;
CREATE POLICY tenant_isolation ON public.crm_accounts USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_contacts;
CREATE POLICY tenant_isolation ON public.crm_contacts USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_leads;
CREATE POLICY tenant_isolation ON public.crm_leads USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_opportunities;
CREATE POLICY tenant_isolation ON public.crm_opportunities USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_activities;
CREATE POLICY tenant_isolation ON public.crm_activities USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_cases;
CREATE POLICY tenant_isolation ON public.crm_cases USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_campaigns;
CREATE POLICY tenant_isolation ON public.crm_campaigns USING (tenant_id = public.jwt_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON public.crm_campaign_members;
CREATE POLICY tenant_isolation ON public.crm_campaign_members USING (tenant_id = public.jwt_tenant_id());
