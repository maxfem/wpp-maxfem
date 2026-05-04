
-- 1. Políticas de envio por tenant
CREATE TABLE public.messaging_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Frequency capping
  whatsapp_max_per_day int NOT NULL DEFAULT 3,
  whatsapp_max_per_week int NOT NULL DEFAULT 7,
  email_max_per_day int NOT NULL DEFAULT 5,
  email_max_per_week int NOT NULL DEFAULT 15,
  -- Quiet hours (HH:MM 24h, timezone abaixo)
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time NOT NULL DEFAULT '21:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  -- Pausa global (kill switch)
  whatsapp_paused boolean NOT NULL DEFAULT false,
  email_paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  -- Auto-pause em quality red
  auto_pause_on_red boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messaging_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view policies" ON public.messaging_policies FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Members manage policies" ON public.messaging_policies FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Service role full access policies" ON public.messaging_policies FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_messaging_policies_updated
  BEFORE UPDATE ON public.messaging_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Blocklist unificada (DNC)
CREATE TABLE public.contact_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','all')),
  identifier text NOT NULL,           -- phone normalizado ou email lowercased
  reason text NOT NULL DEFAULT 'manual', -- manual|opt_out|bounce|complaint|stop_keyword
  source text,                        -- contexto (mensagem inbound, webhook SES, etc.)
  customer_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel, identifier)
);

CREATE INDEX idx_blocklist_tenant_channel ON public.contact_blocklist(tenant_id, channel);
CREATE INDEX idx_blocklist_identifier ON public.contact_blocklist(identifier);

ALTER TABLE public.contact_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view blocklist" ON public.contact_blocklist FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Members insert blocklist" ON public.contact_blocklist FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Members delete blocklist" ON public.contact_blocklist FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Service role full access blocklist" ON public.contact_blocklist FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 3. Preferências por categoria
CREATE TABLE public.customer_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  category text NOT NULL CHECK (category IN ('marketing','transactional','news','recovery')),
  opted_in boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, channel, category)
);

CREATE INDEX idx_preferences_customer ON public.customer_preferences(customer_id);

ALTER TABLE public.customer_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage preferences" ON public.customer_preferences FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Service role full access preferences" ON public.customer_preferences FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 4. Tokens públicos para preference center
CREATE TABLE public.unsubscribe_tokens (
  token text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX idx_unsub_tokens_customer ON public.unsubscribe_tokens(customer_id);

ALTER TABLE public.unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read by token" ON public.unsubscribe_tokens FOR SELECT
  USING (true);
CREATE POLICY "Service role full access tokens" ON public.unsubscribe_tokens FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 5. Quality rating em whatsapp_accounts
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS quality_rating text,        -- GREEN|YELLOW|RED|UNKNOWN
  ADD COLUMN IF NOT EXISTS messaging_limit_tier text,  -- TIER_50|TIER_250|TIER_1K|TIER_10K|TIER_100K|TIER_UNLIMITED
  ADD COLUMN IF NOT EXISTS name_status text,           -- APPROVED|PENDING|FLAGGED
  ADD COLUMN IF NOT EXISTS last_quality_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_history jsonb DEFAULT '[]'::jsonb;

-- 6. Índices de performance para frequency capping
CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant_phone_created
  ON public.whatsapp_messages(tenant_id, phone, created_at DESC)
  WHERE direction = 'outbound';

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant_to_created
  ON public.email_logs(tenant_id, to_email, created_at DESC);

-- 7. Helper SQL: gerar token de unsubscribe (idempotente por customer)
CREATE OR REPLACE FUNCTION public.get_or_create_unsubscribe_token(_tenant_id uuid, _customer_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _token text;
  _email text;
  _phone text;
BEGIN
  SELECT token INTO _token FROM public.unsubscribe_tokens
    WHERE customer_id = _customer_id AND tenant_id = _tenant_id LIMIT 1;
  IF _token IS NOT NULL THEN RETURN _token; END IF;

  SELECT email, phone INTO _email, _phone FROM public.customers WHERE id = _customer_id;
  _token := encode(gen_random_bytes(24), 'base64');
  _token := replace(replace(replace(_token, '+','-'),'/','_'),'=','');

  INSERT INTO public.unsubscribe_tokens (token, tenant_id, customer_id, email, phone)
    VALUES (_token, _tenant_id, _customer_id, _email, _phone);
  RETURN _token;
END;
$$;

-- 8. Helper: verificar se identifier está bloqueado
CREATE OR REPLACE FUNCTION public.is_blocked(_tenant_id uuid, _channel text, _identifier text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_blocklist
    WHERE tenant_id = _tenant_id
      AND identifier = _identifier
      AND (channel = _channel OR channel = 'all')
  );
$$;

-- 9. Seed default policy para tenants existentes
INSERT INTO public.messaging_policies (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;
