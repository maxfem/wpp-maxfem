-- P0 A2 (auditoria Fable 5 — tracking divergente):
-- Mesmo pedido podia ser atribuído a 2+ campaign_activities por corrida
-- entre yampi-webhook e o cron yampi-sync (1min). Baseline em prod: 9 pedidos
-- duplicados em 488 conversões (~2% e crescendo).
--
-- Fix em duas partes:
--   1) Cleanup do estado atual: mantém apenas a primeira activity atribuída a
--      cada pedido (a mais antiga por converted_at, tie-break por id).
--      Atividades "perdedoras" voltam pro estado pré-atribuição (limpa
--      converted_at, conversion_value, attribution_order_id, attribution_method)
--      pra que possam ser reaproveitadas pra OUTRO pedido no futuro.
--   2) Índice único parcial em campaign_activities(attribution_order_id) WHERE
--      attribution_order_id IS NOT NULL — garante 1 atribuição por pedido pra
--      sempre, em qualquer caminho (webhook, cron, manual, RPC).

BEGIN;

-- ===== 1) CLEANUP =====
WITH ranked AS (
  SELECT
    id,
    attribution_order_id,
    ROW_NUMBER() OVER (
      PARTITION BY attribution_order_id
      ORDER BY converted_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM campaign_activities
  WHERE attribution_order_id IS NOT NULL
),
losers AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE campaign_activities
SET converted_at         = NULL,
    conversion_value     = NULL,
    attribution_order_id = NULL,
    attribution_method   = NULL
WHERE id IN (SELECT id FROM losers);

-- ===== 2) ÍNDICE ÚNICO PARCIAL =====
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_activities_attribution_order
  ON campaign_activities (attribution_order_id)
  WHERE attribution_order_id IS NOT NULL;

-- ===== 3) SANITY =====
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT attribution_order_id
    FROM campaign_activities
    WHERE attribution_order_id IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'dedup falhou: ainda há % pedidos duplicados', dup_count;
  END IF;
  RAISE NOTICE 'dedup OK: 0 pedidos duplicados; índice único ativo';
END $$;

COMMIT;
