
-- Create tracked_links table
CREATE TABLE public.tracked_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  utm_source TEXT DEFAULT 'whatsapp',
  utm_medium TEXT DEFAULT 'message',
  utm_campaign TEXT,
  utm_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracked_links_code ON public.tracked_links (code);
CREATE INDEX idx_tracked_links_tenant ON public.tracked_links (tenant_id);

ALTER TABLE public.tracked_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tracked links"
  ON public.tracked_links FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can insert tracked links"
  ON public.tracked_links FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can delete tracked links"
  ON public.tracked_links FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access on tracked_links"
  ON public.tracked_links FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create link_clicks table
CREATE TABLE public.link_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES public.tracked_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  referer TEXT
);

CREATE INDEX idx_link_clicks_link_id ON public.link_clicks (link_id);
CREATE INDEX idx_link_clicks_clicked_at ON public.link_clicks (clicked_at);

ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on link_clicks"
  ON public.link_clicks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Members can view clicks via tenant"
  ON public.link_clicks FOR SELECT
  USING (link_id IN (
    SELECT id FROM public.tracked_links
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Add tracking columns to campaign_activities
ALTER TABLE public.campaign_activities
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS conversion_value NUMERIC DEFAULT 0;

-- Allow members to update campaign_activities (for click/conversion tracking)
CREATE POLICY "Members can update activities"
  ON public.campaign_activities FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow service role full access on campaign_activities
CREATE POLICY "Service role full access on campaign_activities"
  ON public.campaign_activities FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
