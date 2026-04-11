
-- Create storage bucket for WhatsApp media
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read access on whatsapp-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload whatsapp-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media');

-- Service role full access
CREATE POLICY "Service role full access on whatsapp-media"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'whatsapp-media')
  WITH CHECK (bucket_id = 'whatsapp-media');
