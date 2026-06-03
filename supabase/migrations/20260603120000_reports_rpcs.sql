-- Área de Relatórios do CRM — RPCs server-side, tenant-scoped, SECURITY DEFINER.
-- Mesmo padrão das rpc_dashboard_* já existentes (search_path public, sem fetch de linha crua no client).
--
-- Convenções espelhadas das funções existentes:
--   * Receita Gerada (atribuída) = SUM(conversion_value) FILTER (converted_at IS NOT NULL)
--     em campaign_activities, filtrando por created_at no período — IDÊNTICO ao martzRevenue
--     de rpc_dashboard_activity_kpis, pra o drill-down bater com o card do dashboard.
--   * Pedido pago = orders.mapped_status IN
--     ('paid','invoiced','approved','shipped','on_carriage','in_transit','delivered').

-- =====================================================================
-- 1) Receita Gerada por origem (drill-down do card "Receita Gerada")
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_report_revenue_by_source(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
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

-- =====================================================================
-- 2) Vendas / Pedidos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_report_sales(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
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

-- =====================================================================
-- 3) Campanhas (performance no período)
-- =====================================================================
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- =====================================================================
-- 4) Clientes / RFM (snapshot — não filtra período)
-- =====================================================================
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

-- Permissões: mesmo padrão das rpc_dashboard_* (executável pelo role autenticado)
GRANT EXECUTE ON FUNCTION public.rpc_report_revenue_by_source(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_report_sales(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_report_campaigns(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_report_customers(uuid) TO authenticated;
