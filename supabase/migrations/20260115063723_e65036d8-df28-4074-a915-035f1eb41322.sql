-- Create internal user roles enum and table for strict internal access control
CREATE TYPE public.internal_role AS ENUM ('helpdesk', 'admin', 'super_admin');

-- Create internal_users table for @lakecity.co.zw staff only
CREATE TABLE public.internal_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    role internal_role NOT NULL DEFAULT 'helpdesk',
    is_override_approver BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(user_id),
    UNIQUE(email),
    CONSTRAINT email_domain_check CHECK (email LIKE '%@lakecity.co.zw')
);

-- Enable RLS
ALTER TABLE public.internal_users ENABLE ROW LEVEL SECURITY;

-- Create audit_log table for 30-day activity tracking
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    performed_by UUID REFERENCES auth.users(id),
    performed_by_email TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Create knowledge_base table for troubleshooting articles
CREATE TABLE public.knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on knowledge_base
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is internal staff
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.internal_users WHERE user_id = _user_id
    )
$$;

-- Security definer function to get internal user role
CREATE OR REPLACE FUNCTION public.get_internal_role(_user_id UUID)
RETURNS internal_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.internal_users WHERE user_id = _user_id
$$;

-- Security definer function to check if user is override approver
CREATE OR REPLACE FUNCTION public.is_override_approver(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT is_override_approver FROM public.internal_users WHERE user_id = _user_id),
        FALSE
    )
$$;

-- RLS Policies for internal_users (only internal users can view, super_admins can modify)
CREATE POLICY "Internal users can view internal users list"
ON public.internal_users
FOR SELECT
TO authenticated
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Super admins can insert internal users"
ON public.internal_users
FOR INSERT
TO authenticated
WITH CHECK (public.get_internal_role(auth.uid()) = 'super_admin');

CREATE POLICY "Super admins can update internal users"
ON public.internal_users
FOR UPDATE
TO authenticated
USING (public.get_internal_role(auth.uid()) = 'super_admin');

CREATE POLICY "Super admins can delete internal users"
ON public.internal_users
FOR DELETE
TO authenticated
USING (public.get_internal_role(auth.uid()) = 'super_admin');

-- RLS Policies for audit_log (internal users can view and insert)
CREATE POLICY "Internal users can view audit logs"
ON public.audit_log
FOR SELECT
TO authenticated
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create audit entries"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_internal_user(auth.uid()));

-- RLS Policies for knowledge_base (internal users can read, admins can write)
CREATE POLICY "Internal users can view knowledge base"
ON public.knowledge_base
FOR SELECT
TO authenticated
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Admins can manage knowledge base"
ON public.knowledge_base
FOR ALL
TO authenticated
USING (public.get_internal_role(auth.uid()) IN ('admin', 'super_admin'));

-- Create indexes for performance
CREATE INDEX idx_internal_users_user_id ON public.internal_users(user_id);
CREATE INDEX idx_internal_users_email ON public.internal_users(email);
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_performed_by ON public.audit_log(performed_by);
CREATE INDEX idx_knowledge_base_category ON public.knowledge_base(category);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_internal_users_updated_at
    BEFORE UPDATE ON public.internal_users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_knowledge_base_updated_at
    BEFORE UPDATE ON public.knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();