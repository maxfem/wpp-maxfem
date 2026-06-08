-- FIX: cron yampi-sync re-enfileira mesmo pedido a cada minuto.
--
-- Diagnóstico:
-- - Pós-compra Imunofem 1 mês: 13910 jobs / 757 clientes = 18.4× por cliente
-- - Pós-compra Imunofem 3 meses: 6053 / 519 = 11.7×
--
-- Causa: yampi-sync (cron 1min) faz INSERT em automation_queue sem dedup por
-- order_id. Índice existente automation_queue_no_dup_active só bloqueia
-- enquanto pending/running. Depois que completa/fails, próxima execução do
-- cron re-enfileira pro mesmo pedido.
--
-- Fix: índice único parcial por (campaign, customer, trigger, yampi_order_id)
-- garante 1 enqueue por evento de pedido — pra sempre. Cobre todos os trigger
-- types order_* (paid/approved/delivered/rejected/invoiced/created/etc).
--
-- Cleanup: deduplica o estado atual mantendo apenas a primeira linha por
-- chave (a mais antiga). Evita re-disparar emails legítimos já enviados.

-- Cleanup primeiro (índice falha se há duplicatas pré-existentes)
DELETE FROM automation_queue
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY campaign_id, customer_id, trigger_type, trigger_data->>'yampi_order_id'
      ORDER BY created_at ASC
    ) AS rn
    FROM automation_queue
    WHERE trigger_data->>'yampi_order_id' IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_queue_no_dup_per_order
  ON automation_queue (
    campaign_id, customer_id, trigger_type, (trigger_data->>'yampi_order_id')
  )
  WHERE trigger_data->>'yampi_order_id' IS NOT NULL;

-- (Removido) índice por order_number: redundante com o índice por yampi_order_id
-- — todos os jobs reais do yampi-sync passam yampi_order_id. Rotas alternativas
-- (custom-webhook etc) podem ser cobertas pelo no_dup_active existente.
