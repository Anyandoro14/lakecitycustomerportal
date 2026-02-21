
-- Table to log all collections outreach messages
CREATE TABLE public.collections_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_number text NOT NULL,
  customer_name text,
  outreach_type text NOT NULL CHECK (outreach_type IN ('reminder', 'follow_up', 'escalation')),
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  message_body text NOT NULL,
  tone text,
  sent_by uuid,
  sent_by_email text,
  delivery_status text DEFAULT 'sent',
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collections_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view outreach"
  ON public.collections_outreach FOR SELECT
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create outreach"
  ON public.collections_outreach FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()));

-- Table to track admin notes and payment commitments per stand
CREATE TABLE public.collections_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_number text NOT NULL,
  note_type text NOT NULL DEFAULT 'note' CHECK (note_type IN ('note', 'commitment', 'follow_up')),
  content text NOT NULL,
  follow_up_date date,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collections_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view notes"
  ON public.collections_notes FOR SELECT
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create notes"
  ON public.collections_notes FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE INDEX idx_collections_outreach_stand ON public.collections_outreach(stand_number);
CREATE INDEX idx_collections_notes_stand ON public.collections_notes(stand_number);
