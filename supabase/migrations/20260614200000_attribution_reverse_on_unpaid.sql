-- P0 A1 (auditoria Fable 5): CRM atribuía pedidos NÃO pagos e nunca estornava.
--
-- Sintoma: rpc_report_revenue_by_source somava conversion_value de pedidos
-- waiting_payment/pix_pending/cancelled/refused/refunded — inflando 15-25%
-- da Receita Gerada do CRM em relação à verdade do Yampi.
--
-- Baseline em prod no momento do fix: 130 atividades atribuídas (R$ 27.517,76)
-- vinculadas a pedidos NÃO pagos.
--
-- Fix em 3 partes:
--   1) Trigger AFTER UPDATE em orders: quando mapped_status SAI do conjunto
--      pago, ESTORNA a atribuição (limpa converted_at/conversion_value/
--      attribution_order_id/attribution_method na activity vinculada).
--      Também ATRIBUI quando entra (Pix paga depois de pendente): nesse caso,
--      o reprocesso natural do yampi-sync cuida — o trigger NÃO atribui aqui,
--      porque a regra de atribuição vive na edge function (precisa do UTM,
--      janela de tempo, etc).
--   2) Cleanup imediato das 130 atividades atribuídas a pedidos não pagos.
--   3) Helper SQL public.attribution_status_set('paid') pra consultar a regra
--      em outros pontos do sistema (relatórios, RPCs futuras).

BEGIN;

-- ===== 1) HELPER =====
CREATE OR REPLACE FUNCTION public.attribution_paid_status_set()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY['paid','invoiced','approved','shipped','on_carriage','in_transit','delivered']::text[];
$$;

GRANT EXECUTE ON FUNCTION public.attribution_paid_status_set() TO authenticated, service_role;

-- ===== 2) TRIGGER DE ESTORNO =====
CREATE OR REPLACE FUNCTION public.trg_reverse_attribution_on_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := public.attribution_paid_status_set();
  v_was_paid boolean;
  v_now_paid boolean;
BEGIN
  -- Só age se mapped_status mudou
  IF COALESCE(OLD.mapped_status, '') = COALESCE(NEW.mapped_status, '') THEN
    RETURN NEW;
  END IF;

  v_was_paid := OLD.mapped_status = ANY(v_paid);
  v_now_paid := NEW.mapped_status = ANY(v_paid);

  -- Saiu do estado pago → estorna atribuição (se existir)
  IF v_was_paid AND NOT v_now_paid THEN
    UPDATE campaign_activities
    SET converted_at         = NULL,
        conversion_value     = NULL,
        attribution_order_id = NULL,
        attribution_method   = NULL
    WHERE attribution_order_id = NEW.id;
  END IF;

  -- Entrou no estado pago (Pix pagou depois de pendente) → NÃO atribui aqui.
  -- A regra de atribuição vive em yampi-sync.attributeConversions (precisa de
  -- UTM, janela, clicked_at, etc). O reprocesso normal do cron pega.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_reverse_attribution ON orders;
CREATE TRIGGER trg_orders_reverse_attribution
  AFTER UPDATE OF mapped_status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reverse_attribution_on_unpaid();

-- ===== 3) CLEANUP DAS 130 ATIVIDADES JÁ INFLACIONADAS =====
WITH bad AS (
  SELECT ca.id
  FROM campaign_activities ca
  JOIN orders o ON o.id = ca.attribution_order_id
  WHERE ca.attribution_order_id IS NOT NULL
    AND o.mapped_status NOT IN (
      SELECT unnest(public.attribution_paid_status_set())
    )
)
UPDATE campaign_activities
SET converted_at         = NULL,
    conversion_value     = NULL,
    attribution_order_id = NULL,
    attribution_method   = NULL
WHERE id IN (SELECT id FROM bad);

-- ===== 4) SANITY =====
DO $$
DECLARE
  remaining int;
  remaining_value numeric;
BEGIN
  SELECT count(*), COALESCE(SUM(ca.conversion_value), 0)
  INTO remaining, remaining_value
  FROM campaign_activities ca
  JOIN orders o ON o.id = ca.attribution_order_id
  WHERE ca.attribution_order_id IS NOT NULL
    AND o.mapped_status NOT IN (
      SELECT unnest(public.attribution_paid_status_set())
    );

  IF remaining > 0 THEN
    RAISE EXCEPTION 'cleanup falhou: % atividades não-pagas ainda atribuídas (R$ %)', remaining, remaining_value;
  END IF;
  RAISE NOTICE 'cleanup OK: 0 atividades atribuídas a pedidos não-pagos';
END $$;

COMMIT;
