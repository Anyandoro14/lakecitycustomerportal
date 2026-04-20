UPDATE public.articles
SET content = REPLACE(
  content,
  'If you have any further issues, you can contact me on WhatsApp here: Chat with Alex on WhatsApp',
  'If you have any further issues, you can contact me on WhatsApp: [Chat with Alex on WhatsApp](https://wa.me/17785808657)'
),
updated_at = NOW()
WHERE slug = 'service-update-login-disruption-april-2026';