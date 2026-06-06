-- Blindagem em profundidade: impede re-enqueue do mesmo (campaign, customer, trigger)
-- enquanto já existir uma entrada pendente. Cobre QUALQUER caminho que tentar
-- emitir o evento de novo (DB trigger, edge function, RPC manual, importação, etc).
--
-- Não restringe re-enfileiramentos LEGÍTIMOS depois que o anterior virou
-- 'completed'/'failed' — só bloqueia duplicatas enquanto a entrada anterior
-- ainda está em 'pending' ou 'running'.
--
-- Bug histórico: contact-list-webhook re-emitia lead_created em toda chamada,
-- inflando a fila pra ~20× o tamanho da lista (25721 envios em lista de 1254).

CREATE UNIQUE INDEX IF NOT EXISTS automation_queue_no_dup_active
  ON automation_queue (campaign_id, customer_id, trigger_type)
  WHERE status IN ('pending', 'running');
