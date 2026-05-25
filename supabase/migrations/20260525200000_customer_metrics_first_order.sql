-- Customer metrics: adiciona first_order_at + RPC pra recalcular
-- total_orders/total_spent/avg_ticket/first_order_at/last_order_at a partir de orders.
--
-- Motivação: yampi-sync popula customers + orders mas NUNCA agrega métricas de
-- volta na customers. Consequência: last_order_at fica NULL e first_order_at
-- nem existia → todas as listas dinâmicas baseadas em cohort/recência ficavam
-- vazias.
--
-- Esta migration:
--   1. Adiciona coluna customers.first_order_at
--   2. Cria RPC recalc_customer_metrics(tenant_id) que faz aggregate de orders
--      → customers em UMA query (rápido, mesmo com milhões de pedidos)
--   3. Backfill imediato pra todos os tenants
--   4. Indexa first_order_at pra filtros de cohort

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS first_order_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_first_order_at
  ON public.customers(tenant_id, first_order_at)
  WHERE first_order_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_last_order_at
  ON public.customers(tenant_id, last_order_at)
  WHERE last_order_at IS NOT NULL;

-- RPC: recalcula métricas agregadas pra todo o tenant. Idempotente.
CREATE OR REPLACE FUNCTION public.recalc_customer_metrics(_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  WITH agg AS (
    SELECT
      customer_id,
      COUNT(*)::int                              AS n_orders,
      COALESCE(SUM(total), 0)::numeric           AS sum_total,
      MIN(created_at)                            AS first_at,
      MAX(created_at)                            AS last_at
    FROM orders
    WHERE tenant_id = _tenant_id
      AND customer_id IS NOT NULL
      -- Blocklist em vez de allowlist: Yampi/Bling/Shopify usam dezenas de
      -- variantes de status em PT-BR e EN ("Em transporte", "Faturado",
      -- "Pagamento aprovado", "invoiced", "paid", "shipped", etc).
      -- Excluímos só os que NÃO geraram receita: cancelados, pendentes,
      -- abandonados, recusados, devolvidos, teste.
      AND LOWER(COALESCE(status, '')) NOT IN (
        'cancelled', 'cancelado',
        'pending', 'aguardando pagamento', 'waiting_payment',
        'abandoned', 'abandonado',
        'test',
        'refused', 'rejected', 'failed', 'expired',
        'returned', 'devolvido', 'estornado', 'refunded',
        ''
      )
    GROUP BY customer_id
  )
  UPDATE customers c SET
    total_orders   = agg.n_orders,
    total_spent    = agg.sum_total,
    avg_ticket     = CASE WHEN agg.n_orders > 0 THEN agg.sum_total / agg.n_orders ELSE 0 END,
    first_order_at = agg.first_at,
    last_order_at  = agg.last_at,
    updated_at     = NOW()
  FROM agg
  WHERE c.id = agg.customer_id
    AND c.tenant_id = _tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Zera quem não tem pedido pago (limpa estado antigo)
  UPDATE customers c SET
    total_orders   = 0,
    total_spent    = 0,
    avg_ticket     = 0,
    first_order_at = NULL,
    last_order_at  = NULL
  WHERE c.tenant_id = _tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM orders o
      WHERE o.customer_id = c.id
        AND o.tenant_id = _tenant_id
        AND LOWER(COALESCE(o.status, '')) NOT IN (
          'cancelled', 'cancelado',
          'pending', 'aguardando pagamento', 'waiting_payment',
          'abandoned', 'abandonado',
          'test',
          'refused', 'rejected', 'failed', 'expired',
          'returned', 'devolvido', 'estornado', 'refunded',
          ''
        )
    )
    AND (c.total_orders > 0 OR c.last_order_at IS NOT NULL OR c.first_order_at IS NOT NULL);

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_customer_metrics(uuid) TO authenticated, service_role;

-- Backfill todos os tenants existentes agora (1x). Crons futuros vão manter.
DO $$
DECLARE
  t RECORD;
  n int;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    SELECT public.recalc_customer_metrics(t.id) INTO n;
    RAISE NOTICE 'tenant %: % customers recalculadas', t.id, n;
  END LOOP;
END $$;
