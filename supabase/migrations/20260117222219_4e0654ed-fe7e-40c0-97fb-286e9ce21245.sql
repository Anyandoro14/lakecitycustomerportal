-- Create enum for invitation status
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired');

-- Create enum for invitation channel
CREATE TYPE public.invitation_channel AS ENUM ('email', 'sms', 'whatsapp');

-- Create customer_invitations table
CREATE TABLE public.customer_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stand_number TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_name TEXT,
  channel invitation_channel NOT NULL DEFAULT 'email',
  status invitation_status NOT NULL DEFAULT 'pending',
  message_template TEXT,
  custom_message TEXT,
  invitation_token TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  sent_by UUID REFERENCES auth.users(id),
  sent_by_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customer_onboarding table to track onboarding progress
CREATE TABLE public.customer_onboarding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.customer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_onboarding ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_invitations (internal users can manage)
CREATE POLICY "Internal users can view invitations"
ON public.customer_invitations
FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create invitations"
ON public.customer_invitations
FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update invitations"
ON public.customer_invitations
FOR UPDATE
USING (is_internal_user(auth.uid()));

-- RLS policies for customer_onboarding (users can manage their own)
CREATE POLICY "Users can view their own onboarding"
ON public.customer_onboarding
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own onboarding"
ON public.customer_onboarding
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own onboarding"
ON public.customer_onboarding
FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for updated_at on both tables
CREATE TRIGGER update_customer_invitations_updated_at
BEFORE UPDATE ON public.customer_invitations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_customer_onboarding_updated_at
BEFORE UPDATE ON public.customer_onboarding
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create index for faster lookups
CREATE INDEX idx_customer_invitations_stand ON public.customer_invitations(stand_number);
CREATE INDEX idx_customer_invitations_token ON public.customer_invitations(invitation_token);
CREATE INDEX idx_customer_onboarding_user ON public.customer_onboarding(user_id);