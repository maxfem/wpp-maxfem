-- 1. Corrigir a RPC check_send_allowed para lidar corretamente com timezones
CREATE OR REPLACE FUNCTION public.check_send_allowed(_tenant_id uuid, _channel text, _identifier text, _customer_id uuid, _category text DEFAULT 'marketing'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _policy public.messaging_policies%ROWTYPE;
  _now_local timestamptz;
  _local_time time;
  _max_day int;
  _max_week int;
  _count_day int;
  _count_week int;
  _opted_in boolean;
  _is_paused boolean;
  _tz text;
BEGIN
  -- Busca policy (cria default se não existir)
  SELECT * INTO _policy FROM public.messaging_policies WHERE tenant_id = _tenant_id;
  IF NOT FOUND THEN
    INSERT INTO public.messaging_policies (tenant_id) VALUES (_tenant_id)
      RETURNING * INTO _policy;
  END IF;

  _tz := COALESCE(_policy.timezone, 'America/Sao_Paulo');

  -- Pause global
  _is_paused := CASE _channel WHEN 'whatsapp' THEN _policy.whatsapp_paused ELSE _policy.email_paused END;
  IF _is_paused THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'channel_paused', 'detail', _policy.pause_reason);
  END IF;

  -- Transacional ignora resto das regras
  IF _category = 'transactional' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'transactional_bypass');
  END IF;

  -- Blocklist
  IF public.is_blocked(_tenant_id, _channel, _identifier) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'blocklist');
  END IF;

  -- Preferências
  IF _customer_id IS NOT NULL THEN
    SELECT opted_in INTO _opted_in
      FROM public.customer_preferences
      WHERE customer_id = _customer_id AND channel = _channel AND category = _category;
    IF FOUND AND _opted_in = false THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'opted_out', 'category', _category);
    END IF;
  END IF;

  -- Quiet hours com correção de timezone
  IF _policy.quiet_hours_enabled THEN
    _now_local := now() AT TIME ZONE _tz;
    _local_time := _now_local::time;
    
    IF _policy.quiet_hours_start < _policy.quiet_hours_end THEN
      -- Mesmo dia
      IF _local_time >= _policy.quiet_hours_start AND _local_time < _policy.quiet_hours_end THEN
        RETURN jsonb_build_object(
          'allowed', false, 'reason', 'quiet_hours',
          'reschedule_until', ((date_trunc('day', _now_local) + _policy.quiet_hours_end) AT TIME ZONE _tz)::text
        );
      END IF;
    ELSE
      -- Atravessa meia-noite
      IF _local_time >= _policy.quiet_hours_start OR _local_time < _policy.quiet_hours_end THEN
        DECLARE _next timestamptz;
        BEGIN
          IF _local_time >= _policy.quiet_hours_start THEN
            _next := (date_trunc('day', _now_local) + interval '1 day' + _policy.quiet_hours_end) AT TIME ZONE _tz;
          ELSE
            _next := (date_trunc('day', _now_local) + _policy.quiet_hours_end) AT TIME ZONE _tz;
          END IF;
          RETURN jsonb_build_object(
            'allowed', false, 'reason', 'quiet_hours',
            'reschedule_until', _next::text
          );
        END;
      END IF;
    END IF;
  END IF;

  -- Frequency capping
  IF _channel = 'whatsapp' THEN
    _max_day := _policy.whatsapp_max_per_day;
    _max_week := _policy.whatsapp_max_per_week;
    SELECT COUNT(*) INTO _count_day FROM public.whatsapp_messages
      WHERE tenant_id = _tenant_id AND phone = _identifier
        AND direction = 'outbound' AND created_at >= now() - interval '24 hours';
    SELECT COUNT(*) INTO _count_week FROM public.whatsapp_messages
      WHERE tenant_id = _tenant_id AND phone = _identifier
        AND direction = 'outbound' AND created_at >= now() - interval '7 days';
  ELSE
    _max_day := _policy.email_max_per_day;
    _max_week := _policy.email_max_per_week;
    SELECT COUNT(*) INTO _count_day FROM public.email_logs
      WHERE tenant_id = _tenant_id AND lower(to_email) = lower(_identifier)
        AND created_at >= now() - interval '24 hours';
    SELECT COUNT(*) INTO _count_week FROM public.email_logs
      WHERE tenant_id = _tenant_id AND lower(to_email) = lower(_identifier)
        AND created_at >= now() - interval '7 days';
  END IF;

  IF _count_day >= _max_day THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'frequency_cap_day',
      'count', _count_day, 'max', _max_day);
  END IF;
  IF _count_week >= _max_week THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'frequency_cap_week',
      'count', _count_week, 'max', _max_week);
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$function$;

-- 2. Adicionar coluna de erro na fila para diagnóstico se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='automation_queue' AND column_name='error_message') THEN
        ALTER TABLE public.automation_queue ADD COLUMN error_message TEXT;
    END IF;
END $$;

-- 3. Criar tabela de eventos de saúde
CREATE TABLE IF NOT EXISTS public.whatsapp_health_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

ALTER TABLE public.whatsapp_health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view health events"
ON public.whatsapp_health_events
FOR SELECT
USING (public.is_tenant_member(auth.uid(), tenant_id));

-- 4. Normalizar itens travados: se scheduled_for for no passado mas a RPC os travou, 
-- resetamos para nulo para que o executor tente processar (ele chamará a RPC corrigida)
UPDATE public.automation_queue
SET scheduled_for = NULL
WHERE status = 'pending' 
  AND scheduled_for IS NOT NULL 
  AND scheduled_for < (now() + interval '1 hour');
