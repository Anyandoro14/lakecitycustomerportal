
-- Training progress tracking table
CREATE TABLE public.training_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  training_path TEXT NOT NULL DEFAULT 'lead',
  module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked',
  quiz_score INTEGER,
  quiz_passed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, training_path, module_id)
);

-- Training questions/suggestions table
CREATE TABLE public.training_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  module_id TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'question',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Training AI chat history
CREATE TABLE public.training_chat_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  module_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_chat_history ENABLE ROW LEVEL SECURITY;

-- RLS policies: internal users only
CREATE POLICY "Internal users can manage their training progress"
ON public.training_progress FOR ALL
TO authenticated
USING (is_internal_user(auth.uid()) AND user_id = auth.uid())
WITH CHECK (is_internal_user(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Super admins can view all training progress"
ON public.training_progress FOR SELECT
TO authenticated
USING (get_internal_role(auth.uid()) = 'super_admin'::internal_role);

CREATE POLICY "Internal users can manage their questions"
ON public.training_questions FOR ALL
TO authenticated
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can manage their chat history"
ON public.training_chat_history FOR ALL
TO authenticated
USING (is_internal_user(auth.uid()) AND user_id = auth.uid())
WITH CHECK (is_internal_user(auth.uid()) AND user_id = auth.uid());
