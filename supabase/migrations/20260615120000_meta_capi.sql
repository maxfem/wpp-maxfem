-- A5 (auditoria Fable 5): Meta Conversions API server-side com dedup por event_id.
--
-- Problema: Pixel client-side perde ~38% (iOS/adblock/ITP/Brave). Hoje a Maxfem
-- usa cupom CLAREADOR15 como proxy ground-truth, mas isso só cobre 1 campanha
-- e exige cupom em todas as LPs. CAPI server-side resolve estruturalmente: a
-- gente envia o Purchase do servidor com event_id = order.external_id (mesmo
-- ID que o Pixel cliente já envia), e o Meta dedupla. Resultado: Meta enxerga
-- o pedido mesmo se o pixel não disparou no browser.
--
-- Esta migration cria APENAS o esquema (tabelas + RLS + helper). A edge
-- function meta-capi e o trigger ficam em arquivos próprios. Pra ativar pra
-- um tenant: INSERT em meta_capi_config + set META_CAPI_ACCESS_TOKEN no
-- supabase secrets (ou usar o token guardado na tabela, criptografado).

BEGIN;

-- =====================================================================
-- meta_capi_config — config por tenant
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.meta_capi_config (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  pixel_id         text NOT NULL,
  enabled          boolean NOT NULL DEFAULT false,
  -- Test event code do Events Manager → eventos vão pra aba "Test Events" e
  -- não contam pra atribuição real. Setar pra smoke test, depois apagar.
  test_event_code  text,
  -- Action source: 'website' (padrão), 'app', 'phone_call', 'chat',
  -- 'physical_store', 'system_generated', 'business_messaging', 'other'
  action_source    text NOT NULL DEFAULT 'website',
  -- Lista de eventos que esse tenant emite via CAPI (default só Purchase)
  events_enabled   text[] NOT NULL DEFAULT ARRAY['Purchase']::text[],
  -- Domínio principal pra event_source_url
  default_event_source_url text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.meta_capi_config_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_config_updated ON public.meta_capi_config;
CREATE TRIGGER trg_meta_capi_config_updated
  BEFORE UPDATE ON public.meta_capi_config
  FOR EACH ROW EXECUTE FUNCTION public.meta_capi_config_touch_updated();

ALTER TABLE public.meta_capi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_capi_config_select ON public.meta_capi_config
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY meta_capi_config_modify ON public.meta_capi_config
  FOR ALL USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- =====================================================================
-- meta_capi_events — log de eventos enviados (observabilidade + dedup local)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pixel_id        text NOT NULL,
  event_id        text NOT NULL,
  event_name      text NOT NULL,
  event_time      timestamptz NOT NULL,
  source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status          text NOT NULL CHECK (status IN ('queued','sent','skipped','failed')),
  http_status     int,
  fbtrace_id      text,
  events_received int,
  response_body   jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Dedup local: 1 evento por (tenant, pixel, event_id, event_name).
-- A função meta-capi faz ON CONFLICT DO NOTHING e retorna 'skipped'
-- se já enviou esse evento. Mesma dedup que o Meta faz com event_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_capi_events_dedup
  ON public.meta_capi_events (tenant_id, pixel_id, event_id, event_name);

CREATE INDEX IF NOT EXISTS idx_meta_capi_events_order
  ON public.meta_capi_events (source_order_id) WHERE source_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_tenant_time
  ON public.meta_capi_events (tenant_id, event_time DESC);

ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_capi_events_select ON public.meta_capi_events
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
-- INSERT é só pela edge function (service_role bypassa RLS). authenticated
-- não escreve direto.

-- =====================================================================
-- Helper: dispara a edge function via net.http_post quando um pedido vira pago
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_meta_capi_dispatch_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := public.attribution_paid_status_set();
  v_was_paid boolean;
  v_now_paid boolean;
  v_cfg record;
  v_supabase_url text;
  v_service_key text;
BEGIN
  IF COALESCE(OLD.mapped_status, '') = COALESCE(NEW.mapped_status, '') THEN
    RETURN NEW;
  END IF;
  v_was_paid := OLD.mapped_status = ANY(v_paid);
  v_now_paid := NEW.mapped_status = ANY(v_paid);

  -- Só dispara em transição NÃO-pago → pago
  IF v_was_paid OR NOT v_now_paid THEN
    RETURN NEW;
  END IF;

  -- Tenant tem CAPI ligada + Purchase no events_enabled?
  SELECT * INTO v_cfg FROM meta_capi_config
   WHERE tenant_id = NEW.tenant_id AND enabled = true
     AND 'Purchase' = ANY(events_enabled);
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Pega Supabase URL + service key dos settings (set via supabase secrets)
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key  := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'meta-capi dispatch skipped: app.settings.supabase_url/service_role_key não configurado';
    RETURN NEW;
  END IF;

  -- Fire-and-forget. A edge function lida com retry/log.
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/meta-capi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'order_id',  NEW.id,
      'event',     'Purchase',
      'trigger',   'order_paid'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_meta_capi_dispatch ON orders;
CREATE TRIGGER trg_orders_meta_capi_dispatch
  AFTER UPDATE OF mapped_status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_meta_capi_dispatch_on_paid();

-- Também dispara em INSERT (pedido já vem com mapped_status pago — pix instantâneo, cartão aprovado)
CREATE OR REPLACE FUNCTION public.trg_meta_capi_dispatch_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := public.attribution_paid_status_set();
  v_cfg record;
  v_supabase_url text;
  v_service_key text;
BEGIN
  IF NEW.mapped_status IS NULL OR NEW.mapped_status <> ALL(v_paid) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg FROM meta_capi_config
   WHERE tenant_id = NEW.tenant_id AND enabled = true
     AND 'Purchase' = ANY(events_enabled);
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key  := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/meta-capi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'order_id',  NEW.id,
      'event',     'Purchase',
      'trigger',   'order_insert_paid'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_meta_capi_dispatch_insert ON orders;
CREATE TRIGGER trg_orders_meta_capi_dispatch_insert
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_meta_capi_dispatch_on_insert();

COMMIT;
