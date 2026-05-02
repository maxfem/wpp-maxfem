-- Bucket público para imagens utilizadas nos pop-ups
INSERT INTO storage.buckets (id, name, public)
VALUES ('popup-assets', 'popup-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (necessária pois o pop-up roda em sites externos)
CREATE POLICY "Popup assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'popup-assets');

-- Upload restrito a usuários autenticados, dentro de uma pasta de tenant da qual fazem parte
CREATE POLICY "Tenant members can upload popup assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'popup-assets'
  AND (
    (storage.foldername(name))[1] IS NULL
    OR public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Tenant members can update popup assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'popup-assets'
  AND (
    (storage.foldername(name))[1] IS NULL
    OR public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Tenant members can delete popup assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'popup-assets'
  AND (
    (storage.foldername(name))[1] IS NULL
    OR public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

-- Service role full access
CREATE POLICY "Service role full access on popup-assets"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'popup-assets')
WITH CHECK (bucket_id = 'popup-assets');