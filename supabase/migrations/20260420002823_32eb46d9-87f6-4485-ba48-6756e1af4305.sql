UPDATE public.articles
SET content = REPLACE(
  content,
  E'Alex Nyandoro\nDirector at LakeCity',
  E'Alex Nyandoro\n\nDirector at LakeCity'
),
updated_at = NOW()
WHERE slug = 'service-update-login-disruption-april-2026';