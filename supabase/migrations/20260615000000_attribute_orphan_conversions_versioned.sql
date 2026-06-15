-- A4 (auditoria Fable 5): formaliza public.attribute_orphan_conversions(uuid, integer)
-- no versionamento.
--
-- A função foi criada manualmente direto em prod e roda em pg_cron de hora em hora
-- (job 'attribute-orphan-conversions-hourly': `7 * * * *`), atribuindo pedidos
-- "órfãos" (sem entry em campaign_activities) com as mesmas 3 regras do yampi-sync
-- (UTM email/wa, click_window 72h, last_touch 7d).
--
-- Esta migration:
--   1. Materializa o body atual em código (CREATE OR REPLACE idempotente).
--   2. Adiciona `SET search_path = public` (boas práticas SECURITY DEFINER).
--   3. Adiciona guard de tenant via public.assert_tenant_member (consistência
--      com A1 — fix anterior que travou as 7 outras RPCs SECURITY DEFINER).
--   4. Filtra por public.attribution_paid_status_set() (consistência com A1 —
--      só atribui pedido efetivamente pago, ignora pix_pending/cancelled/refused).
--   5. GRANT EXECUTE pro service_role e authenticated.
--
-- Resultado esperado: cron continua funcionando idêntico, MAS:
--   - sem atribuir pedidos não-pagos (some o pix_pending órfão atribuído)
--   - sem permitir invocação cross-tenant via PostgREST (defesa em camadas)

BEGIN;

CREATE OR REPLACE FUNCTION public.attribute_orphan_conversions(p_tenant uuid, p_days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $function$
DECLARE
  v_order record;
  v_activity_id uuid;
  v_method text;
  v_count int := 0;
  v_revenue numeric := 0;
  v_norm_campaign text;
  v_paid_statuses text[] := public.attribution_paid_status_set();
BEGIN
  -- Guard de tenant. Bypassa service_role/postgres (pg_cron), barra
  -- usuário autenticado de outro tenant ou anon.
  PERFORM public.assert_tenant_member(p_tenant);

  FOR v_order IN
    SELECT o.id, o.customer_id, o.total, o.utm_source, o.utm_campaign, o.created_at
    FROM orders o
    WHERE o.tenant_id = p_tenant
      AND o.created_at >= NOW() - (p_days_back || ' days')::interval
      AND o.mapped_status = ANY(v_paid_statuses)
      AND NOT EXISTS (SELECT 1 FROM campaign_activities ca WHERE ca.attribution_order_id = o.id)
  LOOP
    v_activity_id := NULL;
    v_method := NULL;

    -- Caminho 1: UTM source whatsapp/email + utm_campaign match flex (14d)
    IF LOWER(COALESCE(v_order.utm_source, '')) IN ('whatsapp', 'email') AND v_order.utm_campaign IS NOT NULL THEN
      v_norm_campaign := regexp_replace(lower(v_order.utm_campaign), '[^a-z0-9]', '', 'g');
      SELECT ca.id INTO v_activity_id
      FROM campaign_activities ca
      JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.customer_id = v_order.customer_id
        AND ca.tenant_id = p_tenant
        AND lower(ca.channel) = lower(v_order.utm_source)
        AND ca.converted_at IS NULL
        AND ca.sent_at <= v_order.created_at
        AND ca.sent_at >= v_order.created_at - INTERVAL '14 days'
        AND regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g') = v_norm_campaign
      ORDER BY ca.sent_at DESC LIMIT 1;
      IF v_activity_id IS NOT NULL THEN v_method := 'utm'; END IF;
    END IF;

    -- Caminho 2: cliente CLICOU em activity nas últimas 72h
    IF v_activity_id IS NULL THEN
      SELECT ca.id INTO v_activity_id
      FROM campaign_activities ca
      WHERE ca.customer_id = v_order.customer_id
        AND ca.tenant_id = p_tenant
        AND ca.clicked_at IS NOT NULL
        AND ca.converted_at IS NULL
        AND ca.clicked_at <= v_order.created_at
        AND ca.clicked_at >= v_order.created_at - INTERVAL '72 hours'
      ORDER BY ca.clicked_at DESC LIMIT 1;
      IF v_activity_id IS NOT NULL THEN v_method := 'click_window'; END IF;
    END IF;

    -- Caminho 3: last-touch 7d quando pedido veio direto/orgânico
    IF v_activity_id IS NULL
       AND (v_order.utm_source IS NULL OR LOWER(v_order.utm_source) IN ('', 'direct', 'whatsapp', 'email'))
    THEN
      SELECT ca.id INTO v_activity_id
      FROM campaign_activities ca
      WHERE ca.customer_id = v_order.customer_id
        AND ca.tenant_id = p_tenant
        AND ca.converted_at IS NULL
        AND ca.sent_at <= v_order.created_at
        AND ca.sent_at >= v_order.created_at - INTERVAL '7 days'
        AND ca.status IN ('sent', 'delivered', 'read', 'clicked')
      ORDER BY ca.sent_at DESC LIMIT 1;
      IF v_activity_id IS NOT NULL THEN v_method := 'last_touch_7d'; END IF;
    END IF;

    IF v_activity_id IS NOT NULL THEN
      -- O índice uq_campaign_activities_attribution_order (A2) bloqueia
      -- duplicatas com 23505. Capturamos como race esperada.
      BEGIN
        UPDATE campaign_activities SET
          converted_at = v_order.created_at,
          conversion_value = v_order.total,
          attribution_order_id = v_order.id,
          attribution_method = v_method,
          clicked_at = COALESCE(clicked_at, v_order.created_at - INTERVAL '1 minute'),
          status = CASE WHEN status IN ('sent','delivered','read') THEN 'clicked' ELSE status END
        WHERE id = v_activity_id;
        v_count := v_count + 1;
        v_revenue := v_revenue + COALESCE(v_order.total, 0);
      EXCEPTION WHEN unique_violation THEN
        -- yampi-sync ou outro caller atribuiu o pedido entre o SELECT e o UPDATE
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'orders_attributed', v_count,
    'total_revenue',     v_revenue,
    'ran_at',            NOW()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.attribute_orphan_conversions(uuid, integer)
  TO authenticated, service_role;

-- Sanity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='attribute_orphan_conversions'
  ) THEN
    RAISE EXCEPTION 'attribute_orphan_conversions não foi criada';
  END IF;
  IF position('assert_tenant_member' IN pg_get_functiondef(
       'public.attribute_orphan_conversions(uuid, integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'guard ausente em attribute_orphan_conversions';
  END IF;
  RAISE NOTICE 'attribute_orphan_conversions versionada + guard + filtro PAID_STATUSES ok';
END $$;

COMMIT;
