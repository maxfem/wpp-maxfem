
CREATE TABLE public.automation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for fast pending lookups
CREATE INDEX idx_aq_status ON public.automation_queue(status, created_at);

-- Unique constraint to prevent duplicate sends per cart per automation
CREATE UNIQUE INDEX idx_aq_unique_cart ON public.automation_queue(customer_id, campaign_id, trigger_type)
  WHERE status IN ('pending', 'processing', 'sent');

-- Enable RLS
ALTER TABLE public.automation_queue ENABLE ROW LEVEL SECURITY;

-- Members can view their tenant's queue
CREATE POLICY "Members can view automation queue"
  ON public.automation_queue FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Members can insert into queue
CREATE POLICY "Members can insert automation queue"
  ON public.automation_queue FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Service role full access
CREATE POLICY "Service role full access on automation_queue"
  ON public.automation_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
