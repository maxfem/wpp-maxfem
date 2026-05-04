
CREATE OR REPLACE FUNCTION public.check_send_allowed(
  _tenant_id uuid,
  _channel text,           -- 'whatsapp' | 'email'
  _identifier text,        -- phone normalizado ou email
  _customer_id uuid,
  _category text DEFAULT 'marketing'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
BEGIN
  -- Busca policy (cria default se não existir)
  SELECT * INTO _policy FROM public.messaging_policies WHERE tenant_id = _tenant_id;
  IF NOT FOUND THEN
    INSERT INTO public.messaging_policies (tenant_id) VALUES (_tenant_id)
      RETURNING * INTO _policy;
  END IF;

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

  -- Preferências (se houver registro explícito de opt-out)
  IF _customer_id IS NOT NULL THEN
    SELECT opted_in INTO _opted_in
      FROM public.customer_preferences
      WHERE customer_id = _customer_id AND channel = _channel AND category = _category;
    IF FOUND AND _opted_in = false THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'opted_out', 'category', _category);
    END IF;
  END IF;

  -- Quiet hours
  IF _policy.quiet_hours_enabled THEN
    _now_local := now() AT TIME ZONE _policy.timezone;
    _local_time := _now_local::time;
    IF _policy.quiet_hours_start < _policy.quiet_hours_end THEN
      -- mesmo dia (raro, ex: 13:00-14:00)
      IF _local_time >= _policy.quiet_hours_start AND _local_time < _policy.quiet_hours_end THEN
        RETURN jsonb_build_object(
          'allowed', false, 'reason', 'quiet_hours',
          'reschedule_until', (date_trunc('day', _now_local) + _policy.quiet_hours_end)::text
        );
      END IF;
    ELSE
      -- atravessa meia-noite (ex: 21:00-08:00)
      IF _local_time >= _policy.quiet_hours_start OR _local_time < _policy.quiet_hours_end THEN
        DECLARE _next timestamptz;
        BEGIN
          IF _local_time >= _policy.quiet_hours_start THEN
            _next := (date_trunc('day', _now_local) + interval '1 day' + _policy.quiet_hours_end);
          ELSE
            _next := (date_trunc('day', _now_local) + _policy.quiet_hours_end);
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
$$;
