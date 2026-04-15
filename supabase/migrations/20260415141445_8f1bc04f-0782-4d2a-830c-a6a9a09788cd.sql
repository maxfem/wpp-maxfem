
-- 1. Fix tenant_members privilege escalation: remove open INSERT policy
DROP POLICY IF EXISTS "Users can insert own membership" ON public.tenant_members;

-- Only service_role (used by handle_new_user trigger) can insert
CREATE POLICY "Service role can insert tenant members"
ON public.tenant_members
FOR INSERT
TO service_role
WITH CHECK (true);

-- 2. Restrict whatsapp_accounts SELECT to hide access_token from non-admin members
-- Create a safe view without access_token
CREATE OR REPLACE VIEW public.whatsapp_accounts_safe AS
SELECT id, tenant_id, phone_number_id, display_phone, verified_name, quality_rating, is_active, created_at, updated_at
FROM public.whatsapp_accounts;

-- 3. Fix whatsapp-media bucket: make private and add tenant-scoped policies
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';

-- Remove old public read policy
DROP POLICY IF EXISTS "Public read access on whatsapp-media" ON storage.objects;

-- Add authenticated tenant-scoped SELECT policy
CREATE POLICY "Tenant members can read whatsapp media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

-- Add authenticated tenant-scoped INSERT policy
CREATE POLICY "Tenant members can upload whatsapp media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

-- Service role full access for webhook uploads
CREATE POLICY "Service role full access whatsapp media"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'whatsapp-media')
WITH CHECK (bucket_id = 'whatsapp-media');
