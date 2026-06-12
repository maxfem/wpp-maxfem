-- P0 #1 (auditoria Fable 5): RPCs SECURITY DEFINER sem guard de tenant.
-- Esta migration:
--   1) Cria public.assert_tenant_member(uuid) — RAISE EXCEPTION se caller não for membro.
--      Bypassa service_role (edge functions, crons mantêm acesso normal).
--   2) Recria as 8 RPCs vulneráveis com PERFORM no topo. Bodies extraídos via
--      pg_get_functiondef() do estado de prod e patcheados aqui.

BEGIN;

CREATE OR REPLACE FUNCTION public.assert_tenant_member(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tenant guard: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_member(auth.uid(), p_tenant) THEN
    RAISE EXCEPTION 'tenant guard: user is not a member of tenant %', p_tenant USING ERRCODE = '42501';
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.assert_tenant_member(uuid) TO authenticated, service_role;


-- ============ rpc_report_revenue_by_source ============
CREATE OR REPLACE FUNCTION public.rpc_report_revenue_by_source(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total      numeric;
  v_orders     bigint;
  v_by_source  jsonb;
  v_by_method  jsonb;
  v_by_campaign jsonb;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant);
  
  -- Total atribuído no período (== martzRevenue do dashboard)
  SELECT
    COALESCE(SUM(conversion_value) FILTER (WHERE converted_at IS NOT NULL), 0),
    COUNT(*) FILTER (WHERE converted_at IS NOT NULL AND conversion_value > 0)
  INTO v_total, v_orders
  FROM campaign_activities
  WHERE tenant_id = p_tenant
    AND created_at >= p_from AND created_at <= p_to;

  -- Por canal/origem (whatsapp, email, instagram, ...)
  WITH src AS (
    SELECT
      COALESCE(NULLIF(TRIM(channel), ''), 'desconhecido') AS origem,
      COALESCE(SUM(conversion_value) FILTER (WHERE converted_at IS NOT NULL), 0)::numeric AS receita,
      COUNT(*) FILTER (WHERE converted_at IS NOT NULL AND conversion_value > 0)::bigint AS pedidos
    FROM campaign_activities
    WHERE tenant_id = p_tenant
      AND created_at >= p_from AND created_at <= p_to
    GROUP BY 1
    HAVING COALESCE(SUM(conversion_value) FILTER (WHERE converted_at IS NOT NULL), 0) > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'origem', origem, 'receita', receita, 'pedidos', pedidos
  ) ORDER BY receita DESC), '[]'::jsonb) INTO v_by_source FROM src;

  -- Por método de atribuição (utm / click_window / last_touch_7d)
  WITH m AS (
    SELECT
      COALESCE(NULLIF(TRIM(attribution_method), ''), 'indefinido') AS metodo,
      COALESCE(SUM(conversion_value) FILTER (WHERE converted_at IS NOT NULL), 0)::numeric AS receita,
      COUNT(*) FILTER (WHERE converted_at IS NOT NULL AND conversion_value > 0)::bigint AS pedidos
    FROM campaign_activities
    WHERE tenant_id = p_tenant
      AND created_at >= p_from AND created_at <= p_to
    GROUP BY 1
    HAVING COALESCE(SUM(conversion_value) FILTER (WHERE converted_at IS NOT NULL), 0) > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metodo', metodo, 'receita', receita, 'pedidos', pedidos
  ) ORDER BY receita DESC), '[]'::jsonb) INTO v_by_method FROM m;

  -- Por campanha (qual campanha gerou a receita atribuída)
  WITH camp AS (
    SELECT
      ca.campaign_id,
      COALESCE(c.name, '(sem campanha)') AS nome,
      COALESCE(NULLIF(TRIM(ca.channel), ''), c.type, 'desconhecido') AS origem,
      COALESCE(SUM(ca.conversion_value) FILTER (WHERE ca.converted_at IS NOT NULL), 0)::numeric AS receita,
      COUNT(*) FILTER (WHERE ca.converted_at IS NOT NULL AND ca.conversion_value > 0)::bigint AS pedidos
    FROM campaign_activities ca
    LEFT JOIN campaigns c ON c.id = ca.campaign_id
    WHERE ca.tenant_id = p_tenant
      AND ca.created_at >= p_from AND ca.created_at <= p_to
    GROUP BY ca.campaign_id, c.name, ca.channel, c.type
    HAVING COALESCE(SUM(ca.conversion_value) FILTER (WHERE ca.converted_at IS NOT NULL), 0) > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'campaignId', campaign_id, 'nome', nome, 'origem', origem,
    'receita', receita, 'pedidos', pedidos
  ) ORDER BY receita DESC), '[]'::jsonb) INTO v_by_campaign FROM camp;

  RETURN jsonb_build_object(
    'total',      v_total,
    'orders',     v_orders,
    'bySource',   v_by_source,
    'byMethod',   v_by_method,
    'byCampaign', v_by_campaign
  );
END;
$function$;

-- ============ rpc_report_sales ============
CREATE OR REPLACE FUNCTION public.rpc_report_sales(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paid_statuses text[] := ARRAY['paid','invoiced','approved','shipped','on_carriage','in_transit','delivered'];
  v_total_revenue numeric;
  v_total_orders  bigint;
  v_new_revenue   numeric;
  v_ret_revenue   numeric;
  v_by_status     jsonb;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant);
  
  SELECT COALESCE(SUM(total), 0), COUNT(*)
    INTO v_total_revenue, v_total_orders
  FROM orders
  WHERE tenant_id = p_tenant
    AND mapped_status = ANY(v_paid_statuses)
    AND created_at >= p_from AND created_at <= p_to;

  -- Novos x recorrentes: "novo" = cliente cuja PRIMEIRA compra (first_order_at)
  -- caiu dentro do período; senão é recorrente. Mais fiel que created_at (data de sync).
  SELECT
    COALESCE(SUM(CASE WHEN c.first_order_at >= p_from THEN o.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.first_order_at < p_from OR c.first_order_at IS NULL THEN o.total ELSE 0 END), 0)
  INTO v_new_revenue, v_ret_revenue
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.tenant_id = p_tenant
    AND o.mapped_status = ANY(v_paid_statuses)
    AND o.created_at >= p_from AND o.created_at <= p_to;

  -- Quebra por status (TODOS os pedidos do período, inclusive não pagos)
  WITH s AS (
    SELECT
      COALESCE(NULLIF(TRIM(mapped_status), ''), COALESCE(NULLIF(TRIM(status), ''), 'indefinido')) AS st,
      COUNT(*)::bigint AS pedidos,
      COALESCE(SUM(total), 0)::numeric AS receita
    FROM orders
    WHERE tenant_id = p_tenant
      AND created_at >= p_from AND created_at <= p_to
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', st, 'pedidos', pedidos, 'receita', receita,
    'pago', (st = ANY(v_paid_statuses))
  ) ORDER BY receita DESC), '[]'::jsonb) INTO v_by_status FROM s;

  RETURN jsonb_build_object(
    'totalRevenue', v_total_revenue,
    'totalOrders',  v_total_orders,
    'avgTicket',    CASE WHEN v_total_orders > 0 THEN v_total_revenue / v_total_orders ELSE 0 END,
    'newRevenue',   v_new_revenue,
    'returningRevenue', v_ret_revenue,
    'byStatus',     v_by_status
  );
END;
$function$;

-- ============ rpc_report_customers ============
CREATE OR REPLACE FUNCTION public.rpc_report_customers(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total      bigint;
  v_active     bigint;
  v_ltv        numeric;
  v_cashback   numeric;
  v_by_segment jsonb;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant);
  
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(total_orders, 0) > 0),
    COALESCE(AVG(NULLIF(total_spent, 0)), 0),
    COALESCE(SUM(cashback_balance), 0)
  INTO v_total, v_active, v_ltv, v_cashback
  FROM customers
  WHERE tenant_id = p_tenant;

  WITH seg AS (
    SELECT
      COALESCE(NULLIF(TRIM(rfm_segment), ''), 'sem segmento') AS segmento,
      COUNT(*)::bigint AS clientes,
      COALESCE(SUM(total_spent), 0)::numeric AS receita
    FROM customers
    WHERE tenant_id = p_tenant
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'segmento', segmento, 'clientes', clientes, 'receita', receita
  ) ORDER BY receita DESC), '[]'::jsonb) INTO v_by_segment FROM seg;

  RETURN jsonb_build_object(
    'totalCustomers',  v_total,
    'activeCustomers', v_active,
    'avgLtv',          v_ltv,
    'cashbackOutstanding', v_cashback,
    'bySegment',       v_by_segment
  );
END;
$function$;

-- ============ recalc_cashback_for_tenant ============
CREATE OR REPLACE FUNCTION public.recalc_cashback_for_tenant(_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int := 0;
BEGIN
  PERFORM public.assert_tenant_member(_tenant_id);
  
  -- Guard: se não há regras ativas, zera todo mundo
  IF NOT EXISTS (
    SELECT 1 FROM cashback_rules
    WHERE tenant_id = _tenant_id AND active = true
  ) THEN
    UPDATE customers SET
      cashback_balance = 0,
      cashback_expires_at = NULL,
      cashback_last_calc_at = NOW()
    WHERE tenant_id = _tenant_id AND cashback_balance > 0;
    RETURN 0;
  END IF;

  WITH order_cashback AS (
    SELECT
      o.customer_id,
      ROUND((o.total * r.percent_amount / 100.0)::numeric, 2) AS cb_amount,
      (o.created_at + (COALESCE(r.valid_for_days, 90) || ' days')::interval) AS cb_expires_at
    FROM orders o
    JOIN cashback_rules r
      ON r.tenant_id = o.tenant_id
     AND r.active = true
     AND (r.min_amount IS NULL OR o.total >= r.min_amount)
     AND (r.max_amount IS NULL OR o.total <= r.max_amount)
    WHERE o.tenant_id = _tenant_id
      AND o.customer_id IS NOT NULL
      AND LOWER(COALESCE(o.status, '')) NOT IN (
        'cancelled', 'cancelado',
        'pending', 'aguardando pagamento', 'waiting_payment',
        'abandoned', 'abandonado',
        'test',
        'refused', 'rejected', 'failed', 'expired',
        'returned', 'devolvido', 'estornado', 'refunded',
        ''
      )
      -- Só conta cashback ainda dentro da janela de validade (não expirado)
      AND (o.created_at + (COALESCE(r.valid_for_days, 90) || ' days')::interval) > NOW()
  ),
  agg AS (
    SELECT
      customer_id,
      SUM(cb_amount) AS balance,
      MIN(cb_expires_at) AS next_expiry
    FROM order_cashback
    GROUP BY customer_id
  )
  UPDATE customers c SET
    cashback_balance = COALESCE(agg.balance, 0),
    cashback_expires_at = agg.next_expiry,
    cashback_last_calc_at = NOW()
  FROM agg
  WHERE c.id = agg.customer_id
    AND c.tenant_id = _tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Zera quem não tem mais cashback ativo
  UPDATE customers c SET
    cashback_balance = 0,
    cashback_expires_at = NULL,
    cashback_last_calc_at = NOW()
  WHERE c.tenant_id = _tenant_id
    AND c.cashback_balance > 0
    AND NOT EXISTS (
      SELECT 1 FROM orders o
      JOIN cashback_rules r ON r.tenant_id = o.tenant_id AND r.active = true
      WHERE o.customer_id = c.id
        AND o.tenant_id = _tenant_id
        AND (r.min_amount IS NULL OR o.total >= r.min_amount)
        AND (r.max_amount IS NULL OR o.total <= r.max_amount)
        AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'cancelado', 'pending', 'aguardando pagamento', 'waiting_payment', 'abandoned', 'abandonado', 'test', 'refused', 'rejected', 'failed', 'expired', 'returned', 'devolvido', 'estornado', 'refunded', '')
        AND (o.created_at + (COALESCE(r.valid_for_days, 90) || ' days')::interval) > NOW()
    );

  RETURN v_updated;
END;
$function$;

-- ============ recalc_customer_metrics ============
CREATE OR REPLACE FUNCTION public.recalc_customer_metrics(_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_updated int; BEGIN
  PERFORM public.assert_tenant_member(_tenant_id);
   WITH agg AS (SELECT customer_id, COUNT(*)::int AS n_orders, COALESCE(SUM(total), 0)::numeric AS sum_total, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM orders WHERE tenant_id = _tenant_id AND customer_id IS NOT NULL AND LOWER(COALESCE(status, '')) NOT IN ('cancelled','cancelado','pending','aguardando pagamento','waiting_payment','abandoned','abandonado','test','refused','rejected','failed','expired','returned','devolvido','estornado','refunded','') GROUP BY customer_id) UPDATE customers c SET total_orders = agg.n_orders, total_spent = agg.sum_total, avg_ticket = CASE WHEN agg.n_orders > 0 THEN agg.sum_total / agg.n_orders ELSE 0 END, first_order_at = agg.first_at, last_order_at = agg.last_at, updated_at = NOW() FROM agg WHERE c.id = agg.customer_id AND c.tenant_id = _tenant_id; GET DIAGNOSTICS v_updated = ROW_COUNT; UPDATE customers c SET total_orders = 0, total_spent = 0, avg_ticket = 0, first_order_at = NULL, last_order_at = NULL WHERE c.tenant_id = _tenant_id AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = _tenant_id AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','cancelado','pending','aguardando pagamento','waiting_payment','abandoned','abandonado','test','refused','rejected','failed','expired','returned','devolvido','estornado','refunded','')) AND (c.total_orders > 0 OR c.last_order_at IS NOT NULL OR c.first_order_at IS NOT NULL); RETURN v_updated; END; $function$;

-- ============ preview_dynamic_list ============
CREATE OR REPLACE FUNCTION public.preview_dynamic_list(p_tenant uuid, p_rules jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match text;
  v_rule jsonb;
  v_field text;
  v_op text;
  v_value jsonb;
  v_value_text text;
  v_conditions text[] := ARRAY[]::text[];
  v_joiner text;
  v_sql text;
  v_count int := 0;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant);
  
  IF p_rules IS NULL OR p_rules->'rules' IS NULL OR jsonb_array_length(p_rules->'rules') = 0 THEN
    RETURN 0;
  END IF;

  v_match := COALESCE(p_rules->>'match', 'all');
  v_joiner := CASE WHEN v_match = 'any' THEN ' OR ' ELSE ' AND ' END;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules->'rules')
  LOOP
    v_field := v_rule->>'field';
    v_op := COALESCE(v_rule->>'op', '=');
    v_value := v_rule->'value';
    v_value_text := v_rule->>'value';

    CASE v_field
      WHEN 'total_orders', 'total_spent', 'avg_ticket' THEN
        IF v_op NOT IN ('=', '!=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for %', v_op, v_field;
        END IF;
        v_conditions := v_conditions || format('c.%I %s %s', v_field, v_op, COALESCE(v_value_text, '0'));
      WHEN 'last_order_days_ago' THEN
        IF v_op NOT IN ('=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for last_order_days_ago', v_op;
        END IF;
        v_conditions := v_conditions || format(
          '(c.last_order_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c.last_order_at))/86400 %s %s)',
          v_op, COALESCE(v_value_text, '0')
        );
      WHEN 'first_order_days_ago' THEN
        IF v_op NOT IN ('=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for first_order_days_ago', v_op;
        END IF;
        v_conditions := v_conditions || format(
          '(c.first_order_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c.first_order_at))/86400 %s %s)',
          v_op, COALESCE(v_value_text, '0')
        );
      WHEN 'state', 'city' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) = %L', v_field, v_value_text);
        ELSIF v_op = '!=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) != %L', v_field, v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            v_field, v_value::text
          );
        ELSIF v_op = 'contains' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) ILIKE %L',
            v_field, '%' || v_value_text || '%'
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for %', v_op, v_field;
        END IF;
      WHEN 'has_phone' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.phone IS NOT NULL AND c.phone != ''''' ELSE 'c.phone IS NULL OR c.phone = ''''' END;
      WHEN 'has_email' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.email IS NOT NULL AND c.email != ''''' ELSE 'c.email IS NULL OR c.email = ''''' END;
      WHEN 'rfm_segment' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('c.rfm_segment = %L', v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            'c.rfm_segment = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            v_value::text
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for rfm_segment', v_op;
        END IF;
      WHEN 'tag' THEN
        IF v_op = 'contains' THEN
          v_conditions := v_conditions || format('%L = ANY(c.tags)', v_value_text);
        ELSIF v_op = 'not_contains' THEN
          v_conditions := v_conditions || format('NOT (%L = ANY(c.tags))', v_value_text);
        ELSE
          RAISE EXCEPTION 'Invalid op % for tag', v_op;
        END IF;
      WHEN 'bought_product' THEN
        v_conditions := v_conditions || format(
          'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.items_summary::text ILIKE %L)',
          '%' || v_value_text || '%'
        );
      WHEN 'used_coupon' THEN
        IF v_value_text IS NULL OR v_value_text = '' THEN
          v_conditions := v_conditions || 'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code IS NOT NULL AND o.coupon_code != '''')';
        ELSE
          v_conditions := v_conditions || format(
            'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code = %L)',
            v_value_text
          );
        END IF;
      WHEN 'acquisition_source' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) = %L', 'source', v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            'source', v_value::text
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for acquisition_source', v_op;
        END IF;
      WHEN 'has_shopify', 'has_yampi', 'has_bling' THEN
        DECLARE
          v_key text := CASE v_field
            WHEN 'has_shopify' THEN 'shopify_id'
            WHEN 'has_yampi' THEN 'yampi_id'
            WHEN 'has_bling' THEN 'bling_id'
          END;
        BEGIN
          v_conditions := v_conditions || CASE
            WHEN COALESCE(v_value_text, 'true') = 'true'
              THEN format('(c.custom_attributes->>%L) IS NOT NULL', v_key)
            ELSE format('(c.custom_attributes->>%L) IS NULL', v_key)
          END;
        END;
      WHEN 'marketing_consent' THEN
        v_conditions := v_conditions || CASE
          WHEN COALESCE(v_value_text, 'true') = 'true'
            THEN '(c.custom_attributes->>''marketing_consent'') = ''true'''
          ELSE '(c.custom_attributes->>''marketing_consent'') IS DISTINCT FROM ''true'''
        END;
      ELSE
        RAISE EXCEPTION 'Unknown field: %', v_field;
    END CASE;
  END LOOP;

  IF array_length(v_conditions, 1) IS NULL OR array_length(v_conditions, 1) = 0 THEN
    RETURN 0;
  END IF;

  v_sql := format(
    'SELECT COUNT(*) FROM customers c WHERE c.tenant_id = %L AND (%s)',
    p_tenant, array_to_string(v_conditions, v_joiner)
  );

  EXECUTE v_sql INTO v_count;
  RETURN v_count;
END;
$function$;

-- ============ rpc_report_campaigns ============
-- Originalmente LANGUAGE sql; reescrita como plpgsql pra acomodar o guard.
CREATE OR REPLACE FUNCTION public.rpc_report_campaigns(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
RETURNS TABLE(
  campaign_id uuid,
  nome        text,
  tipo        text,
  origem      text,
  envios      bigint,
  cliques     bigint,
  conversoes  bigint,
  receita     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant);
  RETURN QUERY
  SELECT
    ca.campaign_id,
    COALESCE(c.name, '(sem campanha)') AS nome,
    COALESCE(c.type, '—') AS tipo,
    COALESCE(NULLIF(TRIM(ca.channel), ''), c.type, 'desconhecido') AS origem,
    COUNT(*)::bigint AS envios,
    COUNT(*) FILTER (WHERE ca.clicked_at IS NOT NULL)::bigint AS cliques,
    COUNT(*) FILTER (WHERE ca.converted_at IS NOT NULL AND ca.conversion_value > 0)::bigint AS conversoes,
    COALESCE(SUM(ca.conversion_value) FILTER (WHERE ca.converted_at IS NOT NULL), 0)::numeric AS receita
  FROM campaign_activities ca
  LEFT JOIN campaigns c ON c.id = ca.campaign_id
  WHERE ca.tenant_id = p_tenant
    AND ca.created_at >= p_from AND ca.created_at <= p_to
  GROUP BY ca.campaign_id, c.name, c.type, ca.channel
  ORDER BY receita DESC, envios DESC;
END;
$func$;


-- ============ materialize_dynamic_list ============
CREATE OR REPLACE FUNCTION public.materialize_dynamic_list(p_list_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_rules jsonb;
  v_match text;
  v_rule jsonb;
  v_field text;
  v_op text;
  v_value jsonb;
  v_value_text text;
  v_conditions text[] := ARRAY[]::text[];
  v_joiner text;
  v_sql text;
  v_count int := 0;
BEGIN
  SELECT tenant_id, filter_rules INTO v_tenant, v_rules
  FROM contact_lists WHERE id = p_list_id;

  IF v_tenant IS NULL THEN RAISE EXCEPTION 'List not found: %', p_list_id; END IF;
  PERFORM public.assert_tenant_member(v_tenant);

  IF v_rules IS NULL OR v_rules->'rules' IS NULL OR jsonb_array_length(v_rules->'rules') = 0 THEN
    PERFORM set_config('app.skip_lead_dispatch', 'true', true);
    DELETE FROM contact_list_members WHERE list_id = p_list_id;
    PERFORM set_config('app.skip_lead_dispatch', 'false', true);
    UPDATE contact_lists SET customer_count = 0, updated_at = NOW() WHERE id = p_list_id;
    RETURN 0;
  END IF;

  v_match := COALESCE(v_rules->>'match', 'all');
  v_joiner := CASE WHEN v_match = 'any' THEN ' OR ' ELSE ' AND ' END;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules->'rules')
  LOOP
    v_field := v_rule->>'field';
    v_op := COALESCE(v_rule->>'op', '=');
    v_value := v_rule->'value';
    v_value_text := v_rule->>'value';

    CASE v_field
      WHEN 'total_orders', 'total_spent', 'avg_ticket' THEN
        IF v_op NOT IN ('=', '!=', '>', '>=', '<', '<=') THEN RAISE EXCEPTION 'Invalid op % for %', v_op, v_field; END IF;
        v_conditions := v_conditions || format('c.%I %s %s', v_field, v_op, COALESCE(v_value_text, '0'));
      WHEN 'last_order_days_ago' THEN
        IF v_op NOT IN ('=', '>', '>=', '<', '<=') THEN RAISE EXCEPTION 'Invalid op % for last_order_days_ago', v_op; END IF;
        v_conditions := v_conditions || format('(c.last_order_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c.last_order_at))/86400 %s %s)', v_op, COALESCE(v_value_text, '0'));
      WHEN 'first_order_days_ago' THEN
        IF v_op NOT IN ('=', '>', '>=', '<', '<=') THEN RAISE EXCEPTION 'Invalid op % for first_order_days_ago', v_op; END IF;
        v_conditions := v_conditions || format('(c.first_order_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c.first_order_at))/86400 %s %s)', v_op, COALESCE(v_value_text, '0'));
      WHEN 'state', 'city' THEN
        IF v_op = '=' THEN v_conditions := v_conditions || format('(c.custom_attributes->>%L) = %L', v_field, v_value_text);
        ELSIF v_op = '!=' THEN v_conditions := v_conditions || format('(c.custom_attributes->>%L) != %L', v_field, v_value_text);
        ELSIF v_op = 'in' THEN v_conditions := v_conditions || format('(c.custom_attributes->>%L) = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_field, v_value::text);
        ELSIF v_op = 'contains' THEN v_conditions := v_conditions || format('(c.custom_attributes->>%L) ILIKE %L', v_field, '%' || v_value_text || '%');
        ELSE RAISE EXCEPTION 'Invalid op % for %', v_op, v_field; END IF;
      WHEN 'has_phone' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.phone IS NOT NULL AND c.phone != ''''' ELSE 'c.phone IS NULL OR c.phone = ''''' END;
      WHEN 'has_email' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.email IS NOT NULL AND c.email != ''''' ELSE 'c.email IS NULL OR c.email = ''''' END;
      WHEN 'rfm_segment' THEN
        IF v_op = '=' THEN v_conditions := v_conditions || format('c.rfm_segment = %L', v_value_text);
        ELSIF v_op = 'in' THEN v_conditions := v_conditions || format('c.rfm_segment = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_value::text);
        ELSE RAISE EXCEPTION 'Invalid op % for rfm_segment', v_op; END IF;
      WHEN 'tag' THEN
        IF v_op = 'contains' THEN v_conditions := v_conditions || format('%L = ANY(c.tags)', v_value_text);
        ELSIF v_op = 'not_contains' THEN v_conditions := v_conditions || format('NOT (%L = ANY(c.tags))', v_value_text);
        ELSE RAISE EXCEPTION 'Invalid op % for tag', v_op; END IF;
      WHEN 'bought_product' THEN
        v_conditions := v_conditions || format('EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.items_summary::text ILIKE %L)', '%' || v_value_text || '%');
      WHEN 'used_coupon' THEN
        IF v_value_text IS NULL OR v_value_text = '' THEN v_conditions := v_conditions || 'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code IS NOT NULL AND o.coupon_code != '''')';
        ELSE v_conditions := v_conditions || format('EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code = %L)', v_value_text); END IF;
      WHEN 'acquisition_source' THEN
        IF v_op = '=' THEN v_conditions := v_conditions || format('(c.custom_attributes->>%L) = %L', 'source', v_value_text);
        ELSIF v_op = 'in' THEN v_conditions := v_conditions || format('(c.custom_attributes->>%L) = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', 'source', v_value::text);
        ELSE RAISE EXCEPTION 'Invalid op % for acquisition_source', v_op; END IF;
      WHEN 'has_shopify', 'has_yampi', 'has_bling' THEN
        DECLARE v_key text := CASE v_field WHEN 'has_shopify' THEN 'shopify_id' WHEN 'has_yampi' THEN 'yampi_id' WHEN 'has_bling' THEN 'bling_id' END;
        BEGIN v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN format('(c.custom_attributes->>%L) IS NOT NULL', v_key) ELSE format('(c.custom_attributes->>%L) IS NULL', v_key) END; END;
      WHEN 'marketing_consent' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN '(c.custom_attributes->>''marketing_consent'') = ''true''' ELSE '(c.custom_attributes->>''marketing_consent'') IS DISTINCT FROM ''true''' END;
      ELSE RAISE EXCEPTION 'Unknown field: %', v_field;
    END CASE;
  END LOOP;

  IF array_length(v_conditions, 1) IS NULL OR array_length(v_conditions, 1) = 0 THEN
    PERFORM set_config('app.skip_lead_dispatch', 'true', true);
    DELETE FROM contact_list_members WHERE list_id = p_list_id;
    PERFORM set_config('app.skip_lead_dispatch', 'false', true);
    UPDATE contact_lists SET customer_count = 0, updated_at = NOW() WHERE id = p_list_id;
    RETURN 0;
  END IF;

  -- Skip lead_created dispatch durante o bulk insert — esses customers já
  -- existem, materialize não cria "leads novos" pro propósito de automação.
  PERFORM set_config('app.skip_lead_dispatch', 'true', true);

  DELETE FROM contact_list_members WHERE list_id = p_list_id;

  v_sql := format(
    'INSERT INTO contact_list_members (list_id, customer_id) '
    'SELECT %L, c.id FROM customers c WHERE c.tenant_id = %L AND (%s) '
    'ON CONFLICT (list_id, customer_id) DO NOTHING',
    p_list_id, v_tenant, array_to_string(v_conditions, v_joiner)
  );

  EXECUTE v_sql;

  PERFORM set_config('app.skip_lead_dispatch', 'false', true);

  SELECT COUNT(*) INTO v_count FROM contact_list_members WHERE list_id = p_list_id;
  UPDATE contact_lists SET customer_count = v_count, updated_at = NOW() WHERE id = p_list_id;

  RETURN v_count;
END;
$function$;

-- Sanity: confirma que todas têm guard
DO $$
DECLARE r record; miss text[] := ARRAY[]::text[];
BEGIN
  FOR r IN SELECT fn FROM unnest(ARRAY[
    'public.rpc_report_revenue_by_source(uuid, timestamp with time zone, timestamp with time zone)',
    'public.rpc_report_sales(uuid, timestamp with time zone, timestamp with time zone)',
    'public.rpc_report_campaigns(uuid, timestamp with time zone, timestamp with time zone)',
    'public.rpc_report_customers(uuid)',
    'public.recalc_cashback_for_tenant(uuid)',
    'public.recalc_customer_metrics(uuid)',
    'public.preview_dynamic_list(uuid, jsonb)',
    'public.materialize_dynamic_list(uuid)'
  ]) AS fn LOOP
    IF position('assert_tenant_member' IN pg_get_functiondef(r.fn::regprocedure)) = 0 THEN
      miss := miss || r.fn;
    END IF;
  END LOOP;
  IF array_length(miss, 1) > 0 THEN
    RAISE EXCEPTION 'tenant guard ausente em: %', miss;
  END IF;
  RAISE NOTICE 'tenant guard presente em todas as 8 RPCs alvo.';
END $$;

COMMIT;
