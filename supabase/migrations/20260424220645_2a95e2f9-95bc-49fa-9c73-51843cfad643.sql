UPDATE public.instagram_messages
SET message_type = 'image',
    content = CASE WHEN content = '[unsupported_type]' THEN '📷 Imagem' ELSE content END
WHERE message_type = 'unsupported_type'
  AND media_url IS NOT NULL;