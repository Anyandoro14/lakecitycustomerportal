-- Bridge existing CRM channel tables into v2 CRM activity timeline.

CREATE OR REPLACE VIEW public.crm_activity_feed_view WITH (security_invoker = true) AS
SELECT
  c.tenant_id,
  m.id::TEXT AS source_id,
  'message'::TEXT AS source_type,
  c.stand_number,
  c.customer_name,
  c.primary_phone,
  c.primary_email,
  m.channel::TEXT AS channel,
  m.direction::TEXT AS direction,
  m.body,
  COALESCE(m.sent_at, m.received_at, m.created_at) AS activity_at,
  m.created_at
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
UNION ALL
SELECT
  sc.tenant_id,
  sc.id::TEXT AS source_id,
  'support_case'::TEXT AS source_type,
  sc.stand_number,
  CONCAT(sc.first_name, ' ', sc.last_name) AS customer_name,
  sc.whatsapp_number AS primary_phone,
  sc.email AS primary_email,
  'support'::TEXT AS channel,
  'inbound'::TEXT AS direction,
  sc.description AS body,
  sc.created_at AS activity_at,
  sc.created_at
FROM public.support_cases sc;

GRANT SELECT ON public.crm_activity_feed_view TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seed_crm_cases_from_support_cases(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  inserted_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT sc.*
    FROM public.support_cases sc
    WHERE sc.tenant_id = p_tenant_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.crm_cases cc
        WHERE cc.legacy_support_case_id = sc.id
      )
  LOOP
    INSERT INTO public.crm_cases (
      tenant_id,
      legacy_support_case_id,
      case_number,
      category,
      subject,
      description,
      status
    ) VALUES (
      rec.tenant_id,
      rec.id,
      rec.case_number,
      rec.issue_type,
      rec.sub_issue,
      rec.description,
      CASE
        WHEN rec.status IN ('closed', 'resolved') THEN 'resolved'
        WHEN rec.status IN ('open', 'new') THEN 'open'
        ELSE 'in_progress'
      END
    );
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_crm_cases_from_support_cases(UUID) TO service_role;
