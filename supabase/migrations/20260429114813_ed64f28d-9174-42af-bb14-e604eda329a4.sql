-- 1. Add pixel_public_key to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pixel_public_key TEXT UNIQUE;

-- Backfill existing tenants with a key
UPDATE public.tenants
  SET pixel_public_key = 'mxf_' || replace(gen_random_uuid()::text, '-', '')
  WHERE pixel_public_key IS NULL;

-- 2. pixel_visitors
CREATE TABLE IF NOT EXISTS public.pixel_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  visitor_id TEXT NOT NULL,
  customer_id UUID,
  email TEXT,
  phone TEXT,
  document TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip TEXT,
  country TEXT,
  city TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  page_views INT NOT NULL DEFAULT 0,
  product_views INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pixel_visitors_unique UNIQUE (tenant_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_pixel_visitors_tenant ON public.pixel_visitors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_customer ON public.pixel_visitors(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_email ON public.pixel_visitors(tenant_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_phone ON public.pixel_visitors(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_last_seen ON public.pixel_visitors(tenant_id, last_seen_at DESC);

ALTER TABLE public.pixel_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view pixel visitors"
  ON public.pixel_visitors FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access pixel_visitors"
  ON public.pixel_visitors FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. pixel_events
CREATE TABLE IF NOT EXISTS public.pixel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  visitor_id TEXT NOT NULL,
  customer_id UUID,
  session_id TEXT,
  event_type TEXT NOT NULL,
  url TEXT,
  referrer TEXT,
  page_title TEXT,
  product_id TEXT,
  product_name TEXT,
  product_price NUMERIC,
  product_image TEXT,
  product_url TEXT,
  variant_id TEXT,
  currency TEXT DEFAULT 'BRL',
  cart_value NUMERIC,
  order_id TEXT,
  user_agent TEXT,
  ip TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pixel_events_tenant_visitor ON public.pixel_events(tenant_id, visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_events_tenant_type ON public.pixel_events(tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_events_customer ON public.pixel_events(tenant_id, customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_events_session ON public.pixel_events(session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.pixel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view pixel events"
  ON public.pixel_events FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access pixel_events"
  ON public.pixel_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. pixel_sessions
CREATE TABLE IF NOT EXISTS public.pixel_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  visitor_id TEXT NOT NULL,
  customer_id UUID,
  session_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended BOOLEAN NOT NULL DEFAULT false,
  pages_viewed INT NOT NULL DEFAULT 0,
  products_viewed JSONB NOT NULL DEFAULT '[]'::jsonb,
  cart_value NUMERIC,
  cart_items JSONB,
  checkout_started BOOLEAN NOT NULL DEFAULT false,
  checkout_url TEXT,
  purchased BOOLEAN NOT NULL DEFAULT false,
  abandonment_processed BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pixel_sessions_unique UNIQUE (tenant_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_pixel_sessions_visitor ON public.pixel_sessions(tenant_id, visitor_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_sessions_abandonment ON public.pixel_sessions(tenant_id, last_activity_at)
  WHERE ended = false AND purchased = false AND abandonment_processed = false;

ALTER TABLE public.pixel_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view pixel sessions"
  ON public.pixel_sessions FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access pixel_sessions"
  ON public.pixel_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. updated_at triggers
CREATE TRIGGER update_pixel_visitors_updated_at
  BEFORE UPDATE ON public.pixel_visitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pixel_sessions_updated_at
  BEFORE UPDATE ON public.pixel_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Identity matching function: when a pixel_visitor gets email/phone, link to customer
CREATE OR REPLACE FUNCTION public.link_pixel_visitor_to_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Only run if customer_id not yet set and we have at least one identifier
  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL AND NEW.phone IS NULL AND NEW.document IS NULL THEN
    RETURN NEW;
  END IF;

  -- Try email first
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = NEW.tenant_id AND lower(email) = lower(NEW.email)
    LIMIT 1;
  END IF;

  -- Try phone
  IF v_customer_id IS NULL AND NEW.phone IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = NEW.tenant_id AND phone = NEW.phone
    LIMIT 1;
  END IF;

  -- Try document
  IF v_customer_id IS NULL AND NEW.document IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = NEW.tenant_id AND document = NEW.document
    LIMIT 1;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    NEW.customer_id := v_customer_id;
    -- Propagate to past events for this visitor
    UPDATE public.pixel_events
      SET customer_id = v_customer_id
      WHERE tenant_id = NEW.tenant_id
        AND visitor_id = NEW.visitor_id
        AND customer_id IS NULL;
    UPDATE public.pixel_sessions
      SET customer_id = v_customer_id
      WHERE tenant_id = NEW.tenant_id
        AND visitor_id = NEW.visitor_id
        AND customer_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_pixel_visitor_to_customer
  BEFORE INSERT OR UPDATE OF email, phone, document
  ON public.pixel_visitors
  FOR EACH ROW
  EXECUTE FUNCTION public.link_pixel_visitor_to_customer();

-- 7. Auto-generate pixel_public_key for new tenants
CREATE OR REPLACE FUNCTION public.set_tenant_pixel_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pixel_public_key IS NULL THEN
    NEW.pixel_public_key := 'mxf_' || replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_tenant_pixel_key
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_pixel_key();

-- 8. Unique index on automation_queue for the new triggers (one per session)
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_queue_pixel_unique
  ON public.automation_queue(tenant_id, trigger_type, ((trigger_data->>'session_key')))
  WHERE trigger_type IN ('browse_abandonment', 'cart_abandonment_pixel')
    AND trigger_data->>'session_key' IS NOT NULL;
