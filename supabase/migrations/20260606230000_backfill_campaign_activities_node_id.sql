-- Backfill campaign_activities.node_id pra atividades históricas.
--
-- Bug histórico: send-email-ses fazia upsert em campaign_activities sem
-- node_id, e o campaign-executor não passava nodeId no body da chamada.
-- Resultado: nós de email nas automações apareciam zerados no editor
-- (rpc_node_metrics agrupa por node_id, ignorando NULLs).
--
-- Estratégia de backfill — DUAS fases:
--
-- 1) Cobertura "fácil": campanhas com EXATAMENTE 1 nó sendEmail no flow.
--    Atribuição direta — não há ambiguidade.
--
-- 2) Cobertura "geral": pra campanhas com >1 nó sendEmail, atribuir node_id
--    pelo índice cronológico de envios por customer. O cliente N passa pelos
--    nós email na ordem em que aparecem no flow_data.nodes[]; ordenamos as
--    activities (campaign,customer,email,sent_at) por sent_at e aplicamos
--    o ROW_NUMBER pra mapear pro array de email-node-ids.
--
--    Heurístico (assume flow linear), mas cobre todos os onboarding-style
--    flows reais da Maxfem (Pós-1ª compra, Reativação, Welcome, etc).

CREATE OR REPLACE FUNCTION public._backfill_campaign_activities_node_id()
RETURNS TABLE(fase1_single_node bigint, fase2_multi_node bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fase1 bigint := 0;
  v_fase2 bigint := 0;
BEGIN
  -- Build email_nodes(campaign_id, node_ids[]) via lateral
  CREATE TEMP TABLE _email_nodes ON COMMIT DROP AS
  SELECT
    c.id AS campaign_id,
    ARRAY(
      SELECT n->>'id'
      FROM jsonb_array_elements(c.flow_data->'nodes') AS n
      WHERE n->'data'->>'nodeType' = 'sendEmail'
    ) AS node_ids
  FROM campaigns c
  WHERE c.flow_data IS NOT NULL
    AND jsonb_typeof(c.flow_data->'nodes') = 'array';

  -- Fase 1: 1 único nó sendEmail
  WITH upd AS (
    UPDATE campaign_activities a
       SET node_id = e.node_ids[1]
      FROM _email_nodes e
     WHERE a.campaign_id = e.campaign_id
       AND a.channel = 'email'
       AND a.node_id IS NULL
       AND array_length(e.node_ids, 1) = 1
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_fase1 FROM upd;

  -- Fase 2: múltiplos nós → ranking cronológico por (campaign, customer)
  WITH ranked AS (
    SELECT
      a.id,
      a.campaign_id,
      a.customer_id,
      ROW_NUMBER() OVER (
        PARTITION BY a.campaign_id, a.customer_id
        ORDER BY a.sent_at NULLS LAST, a.created_at
      ) AS rn
      FROM campaign_activities a
      JOIN _email_nodes e ON e.campaign_id = a.campaign_id
     WHERE a.channel = 'email'
       AND a.node_id IS NULL
       AND array_length(e.node_ids, 1) > 1
  ),
  mapped AS (
    SELECT r.id, e.node_ids[r.rn] AS the_node_id
      FROM ranked r
      JOIN _email_nodes e ON e.campaign_id = r.campaign_id
     WHERE r.rn <= COALESCE(array_length(e.node_ids, 1), 0)
  ),
  upd2 AS (
    UPDATE campaign_activities a
       SET node_id = m.the_node_id
      FROM mapped m
     WHERE a.id = m.id
       AND m.the_node_id IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_fase2 FROM upd2;

  RETURN QUERY SELECT v_fase1, v_fase2;
END;
$$;

SELECT * FROM public._backfill_campaign_activities_node_id();

DROP FUNCTION public._backfill_campaign_activities_node_id();
