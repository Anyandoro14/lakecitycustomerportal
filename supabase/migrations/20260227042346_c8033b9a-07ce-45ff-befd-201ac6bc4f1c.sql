
-- Track individual email sends per article to prevent duplicates
CREATE TABLE public.article_email_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(article_id, recipient_email)
);

ALTER TABLE public.article_email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage article email sends"
ON public.article_email_sends
FOR ALL
USING (is_internal_user(auth.uid()));

CREATE INDEX idx_article_email_sends_article ON public.article_email_sends(article_id);
