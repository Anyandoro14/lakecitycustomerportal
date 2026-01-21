-- Create enums for conversation status, channel, and direction
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending_customer', 'pending_internal', 'closed');
CREATE TYPE public.message_channel AS ENUM ('whatsapp', 'sms', 'email');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.delivery_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- Create conversations table
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stand_number TEXT, -- nullable for unmatched contacts
    customer_name TEXT,
    customer_category TEXT,
    primary_phone TEXT,
    primary_email TEXT,
    status conversation_status NOT NULL DEFAULT 'open',
    assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on stand_number for fast lookups
CREATE INDEX idx_conversations_stand_number ON public.conversations(stand_number);
CREATE INDEX idx_conversations_primary_phone ON public.conversations(primary_phone);
CREATE INDEX idx_conversations_primary_email ON public.conversations(primary_email);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_assigned_to ON public.conversations(assigned_to_user_id);

-- Create messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    channel message_channel NOT NULL,
    direction message_direction NOT NULL,
    body TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    provider_message_id TEXT,
    delivery_status delivery_status DEFAULT 'queued',
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_messages_provider_message_id ON public.messages(provider_message_id);

-- Create internal notes table (private notes on conversations)
CREATE TABLE public.internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT
);

CREATE INDEX idx_internal_notes_conversation_id ON public.internal_notes(conversation_id);

-- Create conversation assignments audit table
CREATE TABLE public.conversation_assignments_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    from_user_id UUID,
    to_user_id UUID,
    from_user_email TEXT,
    to_user_email TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_by_email TEXT
);

CREATE INDEX idx_assignments_audit_conversation_id ON public.conversation_assignments_audit(conversation_id);

-- Create conversation ticket links table
CREATE TABLE public.conversation_ticket_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    support_case_id UUID NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    linked_by_email TEXT,
    UNIQUE(conversation_id, support_case_id)
);

CREATE INDEX idx_ticket_links_conversation_id ON public.conversation_ticket_links(conversation_id);
CREATE INDEX idx_ticket_links_support_case_id ON public.conversation_ticket_links(support_case_id);

-- Create contact to stand mapping table for identity resolution
CREATE TABLE public.contact_stand_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_identifier TEXT NOT NULL, -- phone or email
    contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'email')),
    stand_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT,
    UNIQUE(contact_identifier, contact_type)
);

CREATE INDEX idx_contact_mappings_identifier ON public.contact_stand_mappings(contact_identifier);

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_assignments_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_ticket_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_stand_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations (internal users only)
CREATE POLICY "Internal users can view conversations"
ON public.conversations FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create conversations"
ON public.conversations FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update conversations"
ON public.conversations FOR UPDATE
USING (is_internal_user(auth.uid()));

-- RLS Policies for messages (internal users only)
CREATE POLICY "Internal users can view messages"
ON public.messages FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create messages"
ON public.messages FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update messages"
ON public.messages FOR UPDATE
USING (is_internal_user(auth.uid()));

-- RLS Policies for internal_notes
CREATE POLICY "Internal users can view internal notes"
ON public.internal_notes FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create internal notes"
ON public.internal_notes FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

-- RLS Policies for conversation_assignments_audit
CREATE POLICY "Internal users can view assignment audit"
ON public.conversation_assignments_audit FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create assignment audit"
ON public.conversation_assignments_audit FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

-- RLS Policies for conversation_ticket_links
CREATE POLICY "Internal users can view ticket links"
ON public.conversation_ticket_links FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create ticket links"
ON public.conversation_ticket_links FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete ticket links"
ON public.conversation_ticket_links FOR DELETE
USING (is_internal_user(auth.uid()));

-- RLS Policies for contact_stand_mappings
CREATE POLICY "Internal users can view contact mappings"
ON public.contact_stand_mappings FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create contact mappings"
ON public.contact_stand_mappings FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

-- Trigger to update conversations.updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Function to update conversation stats when a message is added
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.conversations
    SET 
        last_message_at = COALESCE(NEW.sent_at, NEW.received_at, NEW.created_at),
        unread_count = CASE 
            WHEN NEW.direction = 'inbound' THEN unread_count + 1 
            ELSE unread_count 
        END,
        status = CASE
            WHEN NEW.direction = 'inbound' THEN 'open'::conversation_status
            WHEN NEW.direction = 'outbound' THEN 'pending_customer'::conversation_status
            ELSE status
        END,
        updated_at = now()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_insert
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_on_message();