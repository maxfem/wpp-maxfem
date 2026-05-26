-- Cashback Maxfem: regras Yampi + saldo por cliente
--
-- A API REST do Yampi expõe REGRAS (/pricing/cashbacks) mas NÃO saldo por
-- cliente. Calculamos no CRM aplicando as regras sobre orders pagos.
--
-- Fluxo:
--   1. cashback_rules: espelho das regras Yampi (sync diário)
--   2. customers.cashback_balance/expires_at: saldo computado
--   3. RPC recalc_cashback_for_tenant: aplica regras sobre orders e atualiza
--      o saldo + data de expiração
--   4. Variáveis: {{valor_cashback}}, {{validade_cashback}}, {{link_cashback}}
--      resolvidas no momento do envio via campos da customers

CREATE TABLE IF NOT EXISTS public.cashback_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,                -- ID do Yampi (ex: '709')
  name            TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  percent_amount  NUMERIC NOT NULL,             -- ex: 5 (= 5%)
  min_amount      NUMERIC,                      -- valor mínimo do pedido
  max_amount      NUMERIC,                      -- valor máximo do pedido (null = sem limite)
  valid_for_days  INTEGER,                      -- dias de validade do cashback gerado
  has_expiration  BOOLEAN DEFAULT true,
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_cashback_rules_tenant_active
  ON public.cashback_rules (tenant_id, active)
  WHERE active = true;

ALTER TABLE public.cashback_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members see cashback rules" ON public.cashback_rules
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Saldo por customer
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cashback_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cashback_last_calc_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_cashback_balance
  ON public.customers (tenant_id, cashback_balance)
  WHERE cashback_balance > 0;

CREATE INDEX IF NOT EXISTS idx_customers_cashback_expires_at
  ON public.customers (tenant_id, cashback_expires_at)
  WHERE cashback_balance > 0 AND cashback_expires_at IS NOT NULL;

-- RPC: recalcula cashback de TODO o tenant aplicando todas as regras ativas
-- sobre orders pagos + dentro da janela de validade.
--
-- Lógica:
--   Para cada order pago de cada cliente:
--     Pega regra que case com o valor do pedido (min_amount <= total <= max_amount)
--     Gera cashback = total * percent_amount/100
--     Vencimento = order.created_at + valid_for_days
--   Saldo do cliente = SUM de cashbacks não expirados
--   Expira em = MIN(expires_at) entre os cashbacks ativos (o mais próximo)
CREATE OR REPLACE FUNCTION public.recalc_cashback_for_tenant(_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.recalc_cashback_for_tenant(uuid) TO authenticated, service_role;
