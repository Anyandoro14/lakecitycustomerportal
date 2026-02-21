
-- Tighten feedback INSERT - require authenticated and limit comment length
DROP POLICY "Authenticated users can submit feedback" ON public.article_feedback;

CREATE POLICY "Authenticated users can submit feedback"
ON public.article_feedback FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND char_length(comment) <= 2000
  AND char_length(comment) > 0
);
