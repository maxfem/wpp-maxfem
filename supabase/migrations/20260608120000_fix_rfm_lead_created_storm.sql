-- FIX: tempestade diária de lead_created às 04:13 UTC.
--
-- Cron `rfm-recalculate-daily` chama sync_rfm_lists() que faz DELETE+INSERT
-- em massa em contact_list_members pras 5 listas RFM (Campeões/Leais/...).
-- Cada INSERT dispara trg_lead_created_dispatch, que chama
-- dispatch_automation_trigger('lead_created', customer_id) — e isso enfileira
-- jobs pra TODA campanha com trigger_type='lead_created', incluindo "Lista
-- boas-vindas" que tem nada a ver com listas RFM.
--
-- Diagnóstico (08/06/2026): 6721 jobs criados num único minuto.
-- Mais grave: matchesFilters() do executor ignora list_id, então o email da
-- Lista boas-vindas é enviado pra QUALQUER cliente que entrou em QUALQUER
-- lista RFM.
--
-- Fix 1 — sync_rfm_lists respeita app.skip_lead_dispatch (mesmo padrão do
--          materialize_dynamic_list).
-- Fix 2 — dispatch_automation_trigger só enfileira pra campanhas cuja list_id
--          casa com o list_id do triggerData (quando trigger é lead_created e
--          campaign.list_id está setado).

-- ===== FIX 1: sync_rfm_lists =====
CREATE OR REPLACE FUNCTION public.sync_rfm_lists(_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seg_name text;
  list_uuid uuid;
  seg_count int;
  segments text[] := ARRAY['Campeões', 'Leais', 'Potenciais', 'Em Risco', 'Hibernando'];
BEGIN
  -- Skip lead_created dispatch durante o rebuild — esses clientes JÁ existem,
  -- a re-popularização das listas RFM é recompute, não "novo lead".
  PERFORM set_config('app.skip_lead_dispatch', 'true', true);

  FOREACH seg_name IN ARRAY segments LOOP
    SELECT id INTO list_uuid
      FROM contact_lists
     WHERE tenant_id = _tenant_id AND type = 'rfm' AND name = 'RFM — ' || seg_name;

    IF list_uuid IS NULL THEN
      INSERT INTO contact_lists (tenant_id, name, type, description)
      VALUES (_tenant_id, 'RFM — ' || seg_name, 'rfm', 'Lista automática de clientes no segmento ' || seg_name)
      RETURNING id INTO list_uuid;
    END IF;

    DELETE FROM contact_list_members WHERE list_id = list_uuid;

    INSERT INTO contact_list_members (list_id, customer_id)
    SELECT list_uuid, id FROM customers
     WHERE tenant_id = _tenant_id AND rfm_segment = seg_name;

    SELECT COUNT(*) INTO seg_count FROM contact_list_members WHERE list_id = list_uuid;
    UPDATE contact_lists SET customer_count = seg_count, updated_at = now() WHERE id = list_uuid;
  END LOOP;

  PERFORM set_config('app.skip_lead_dispatch', 'false', true);
END;
$function$;

-- ===== FIX 2: dispatch_automation_trigger valida list_id =====
-- Pra trigger lead_created: só enfileira em campanhas cuja list_id casa com
-- o list_id do triggerData (ou campanhas sem list_id setada, comportamento legacy).
CREATE OR REPLACE FUNCTION public.dispatch_automation_trigger(
  p_tenant_id uuid,
  p_trigger_type text,
  p_customer_id uuid,
  p_trigger_data jsonb DEFAULT '{}'::jsonb
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int := 0;
  v_camp record;
  v_event_list_id uuid;
BEGIN
  -- Extrai list_id do triggerData (pra trigger lead_created)
  IF p_trigger_type = 'lead_created' THEN
    BEGIN
      v_event_list_id := NULLIF(p_trigger_data->>'list_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_event_list_id := NULL;
    END;
  END IF;

  FOR v_camp IN
    SELECT id, tenant_id, list_id
    FROM campaigns
    WHERE tenant_id = p_tenant_id
      AND kind = 'automation'
      AND status = 'running'
      AND trigger_type = p_trigger_type
      -- Pra lead_created com list_id no event: só campanhas cuja list_id casa
      -- (ou campanhas sem list_id setada — fallback legacy "qualquer lista").
      AND (
        p_trigger_type <> 'lead_created'
        OR v_event_list_id IS NULL
        OR list_id IS NULL
        OR list_id = v_event_list_id
      )
  LOOP
    BEGIN
      INSERT INTO automation_queue (
        tenant_id, campaign_id, customer_id, trigger_type, trigger_data, status, current_node_id
      ) VALUES (
        v_camp.tenant_id, v_camp.id, p_customer_id, p_trigger_type, p_trigger_data, 'pending', 'start'
      ) ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_automation_trigger insert failed for campaign=% : %', v_camp.id, sqlerrm;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ===== LIMPEZA da fila atual envenenada =====
-- Apaga jobs pending de "Lista boas-vindas" pra clientes que NÃO estão na lista.
-- Mantém os 5 jobs/h legítimos do webhook (esses sim, lead novo de verdade).
DELETE FROM automation_queue q
USING campaigns c
WHERE q.campaign_id = c.id
  AND q.status IN ('pending', 'running')
  AND q.trigger_type = 'lead_created'
  AND c.list_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contact_list_members m
    WHERE m.list_id = c.list_id AND m.customer_id = q.customer_id
  );
