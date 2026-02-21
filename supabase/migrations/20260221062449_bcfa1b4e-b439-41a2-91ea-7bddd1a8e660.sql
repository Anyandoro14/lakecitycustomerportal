
-- Articles table for CMS
CREATE TABLE public.articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'update',
  author_email TEXT NOT NULL,
  author_name TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read published articles
CREATE POLICY "Anyone can view published articles"
ON public.articles FOR SELECT
USING (is_published = true);

-- Internal users can manage articles
CREATE POLICY "Internal users can manage articles"
ON public.articles FOR ALL
USING (is_internal_user(auth.uid()));

-- Article feedback table
CREATE TABLE public.article_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id UUID,
  stand_number TEXT,
  customer_name TEXT,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.article_feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users can submit feedback
CREATE POLICY "Authenticated users can submit feedback"
ON public.article_feedback FOR INSERT
TO authenticated
WITH CHECK (true);

-- Internal users can view all feedback
CREATE POLICY "Internal users can view all feedback"
ON public.article_feedback FOR SELECT
USING (is_internal_user(auth.uid()));

-- Customers cannot view others' feedback (they can't SELECT at all unless internal)

-- Article read status tracking
CREATE TABLE public.article_read_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_ribbon BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);

ALTER TABLE public.article_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own read status"
ON public.article_read_status FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Article email broadcasts tracking
CREATE TABLE public.article_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  sent_by UUID,
  sent_by_email TEXT,
  recipient_count INTEGER DEFAULT 0,
  broadcast_type TEXT NOT NULL DEFAULT 'all_customers',
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.article_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage broadcasts"
ON public.article_broadcasts FOR ALL
USING (is_internal_user(auth.uid()));

-- Trigger for updated_at on articles
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
