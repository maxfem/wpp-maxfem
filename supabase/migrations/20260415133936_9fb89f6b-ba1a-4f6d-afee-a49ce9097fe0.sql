-- 1. Add UPDATE RLS policy for automation_queue
CREATE POLICY "Members can update automation queue"
ON public.automation_queue
FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 2. Add DELETE RLS policy for automation_queue
CREATE POLICY "Members can delete automation queue"
ON public.automation_queue
FOR DELETE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- 3. Composite indexes for performance
CREATE INDEX IF NOT EXISTS idx_automation_queue_tenant_status ON public.automation_queue (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_automation_queue_campaign_status ON public.automation_queue (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_activities_campaign ON public.campaign_activities (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_activities_tenant_campaign ON public.campaign_activities (tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_phone ON public.whatsapp_messages (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_created ON public.whatsapp_messages (tenant_id, created_at DESC);

-- 4. Restrict storage bucket listing - remove public listing, keep public read for individual files
CREATE POLICY "Authenticated users can list whatsapp media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');