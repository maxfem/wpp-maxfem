-- 1) Recount em STATEMENT-level (1 por INSERT batch, não por linha)
DROP TRIGGER IF EXISTS contact_list_members_count_sync ON public.contact_list_members;

CREATE OR REPLACE FUNCTION public.trg_sync_contact_list_count_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalcula só pras listas afetadas (via tabela transition NEW/OLD)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.recompute_contact_list_count(list_id)
    FROM (SELECT DISTINCT list_id FROM new_rows) x;
  END IF;
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    PERFORM public.recompute_contact_list_count(list_id)
    FROM (SELECT DISTINCT list_id FROM old_rows) x;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER contact_list_members_count_sync_ins
  AFTER INSERT ON public.contact_list_members
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_sync_contact_list_count_stmt();

CREATE TRIGGER contact_list_members_count_sync_del
  AFTER DELETE ON public.contact_list_members
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_sync_contact_list_count_stmt();

CREATE TRIGGER contact_list_members_count_sync_upd
  AFTER UPDATE ON public.contact_list_members
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_sync_contact_list_count_stmt();

-- 2) Skip lead_created dispatch durante bulk materialize (via session flag)
CREATE OR REPLACE FUNCTION public.trg_lead_created_on_list_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant uuid;
  v_list_name text;
  v_skip text;
BEGIN
  -- Materialize em massa seta esse flag pra evitar disparar N automações
  -- pra clientes que JÁ existiam (recompute de regra, não criação real).
  BEGIN
    v_skip := current_setting('app.skip_lead_dispatch', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, name INTO v_tenant, v_list_name FROM contact_lists WHERE id = new.list_id;
  IF v_tenant IS NULL THEN RETURN new; END IF;
  PERFORM dispatch_automation_trigger(
    v_tenant, 'lead_created', new.customer_id,
    jsonb_build_object('list_id', new.list_id, 'list_name', v_list_name, 'added_at', new.added_at)
  );
  RETURN new;
END;
$$;

-- 3) Materialize seta o flag de skip + remove o set_config superuser
CREATE OR REPLACE FUNCTION public.materialize_dynamic_list(p_list_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.materialize_dynamic_list(uuid) TO authenticated, service_role;
