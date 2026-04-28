-- Add tenant_id and SES tracking columns to email_logs
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS configuration_set text,
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS opens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_type text,
  ADD COLUMN IF NOT EXISTS bounce_subtype text,
  ADD COLUMN IF NOT EXISTS complaint_type text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS from_email text,
  ADD COLUMN IF NOT EXISTS source_ip text;

-- Backfill tenant_id from user_id where possible
UPDATE public.email_logs el
SET tenant_id = tm.tenant_id
FROM public.tenant_members tm
WHERE el.user_id = tm.user_id AND el.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON public.email_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_aws_message_id ON public.email_logs(aws_message_id);

-- Allow tenant members to manage email_logs
DROP POLICY IF EXISTS "Tenant members view email logs" ON public.email_logs;
CREATE POLICY "Tenant members view email logs"
ON public.email_logs FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())) OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access email_logs" ON public.email_logs;
CREATE POLICY "Service role full access email_logs"
ON public.email_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant members insert email logs" ON public.email_logs;
CREATE POLICY "Tenant members insert email logs"
ON public.email_logs FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())) OR auth.uid() = user_id);

-- email_events table for SES SNS notifications
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  message_id text NOT NULL,
  event_type text NOT NULL,
  recipient text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  configuration_set text,
  source_email text,
  source_ip text,
  user_agent text,
  link_url text,
  bounce_type text,
  bounce_subtype text,
  smtp_response text,
  complaint_type text,
  diagnostic_code text,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_tenant_time ON public.email_events(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_message_id ON public.email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events(event_type);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view email events"
ON public.email_events FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access email_events"
ON public.email_events FOR ALL TO service_role
USING (true) WITH CHECK (true);