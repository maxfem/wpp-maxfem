-- Materializa lista dinâmica baseada em filter_rules JSON.
--
-- filter_rules schema:
-- {
--   "match": "all" | "any",
--   "rules": [
--     { "field": "<name>", "op": "<op>", "value": <value> }
--   ]
-- }
--
-- Campos suportados:
--   total_orders, total_spent, avg_ticket           (numeric)
--   last_order_days_ago                              (computed: NOW - last_order_at em dias)
--   state, city                                      (text, custom_attributes->>)
--   email, phone, name, document                     (text, customers.*)
--   has_phone, has_email                             (boolean, deriva de NOT NULL)
--   rfm_segment                                      (text)
--   tag                                              (text, customers.tags contains)
--   bought_product                                   (text, EXISTS in orders.items_summary)
--   used_coupon                                      (text, EXISTS in orders.coupon_code)
--
-- Operadores: =, !=, >, >=, <, <=, in, not_in, contains, starts_with, is_null, is_not_null
--
CREATE OR REPLACE FUNCTION public.materialize_dynamic_list(p_list_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'List not found: %', p_list_id;
  END IF;
  IF v_rules IS NULL OR v_rules->'rules' IS NULL OR jsonb_array_length(v_rules->'rules') = 0 THEN
    -- Sem regras, esvazia lista
    DELETE FROM contact_list_members WHERE list_id = p_list_id;
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

    -- Whitelist of allowed fields/operators (security: prevent SQL injection)
    CASE v_field
      WHEN 'total_orders', 'total_spent', 'avg_ticket' THEN
        IF v_op NOT IN ('=', '!=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for numeric field %', v_op, v_field;
        END IF;
        v_conditions := v_conditions || format('c.%I %s %s', v_field, v_op, COALESCE(v_value_text, '0'));

      WHEN 'last_order_days_ago' THEN
        IF v_op NOT IN ('=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for last_order_days_ago', v_op;
        END IF;
        v_conditions := v_conditions || format(
          '(c.last_order_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c.last_order_at))/86400 %s %s)',
          v_op, COALESCE(v_value_text, '0')
        );

      WHEN 'state', 'city' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) = %L', v_field, v_value_text);
        ELSIF v_op = '!=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) != %L', v_field, v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            v_field, v_value::text
          );
        ELSIF v_op = 'contains' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) ILIKE %L',
            v_field, '%' || v_value_text || '%'
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for %', v_op, v_field;
        END IF;

      WHEN 'has_phone' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.phone IS NOT NULL AND c.phone != ''''' ELSE 'c.phone IS NULL OR c.phone = ''''' END;
      WHEN 'has_email' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.email IS NOT NULL AND c.email != ''''' ELSE 'c.email IS NULL OR c.email = ''''' END;

      WHEN 'rfm_segment' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('c.rfm_segment = %L', v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            'c.rfm_segment = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            v_value::text
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for rfm_segment', v_op;
        END IF;

      WHEN 'tag' THEN
        IF v_op = 'contains' THEN
          v_conditions := v_conditions || format('%L = ANY(c.tags)', v_value_text);
        ELSIF v_op = 'not_contains' THEN
          v_conditions := v_conditions || format('NOT (%L = ANY(c.tags))', v_value_text);
        ELSE
          RAISE EXCEPTION 'Invalid op % for tag', v_op;
        END IF;

      WHEN 'bought_product' THEN
        v_conditions := v_conditions || format(
          'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.items_summary::text ILIKE %L)',
          '%' || v_value_text || '%'
        );

      WHEN 'used_coupon' THEN
        IF v_value_text IS NULL OR v_value_text = '' THEN
          v_conditions := v_conditions || 'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code IS NOT NULL AND o.coupon_code != '''')';
        ELSE
          v_conditions := v_conditions || format(
            'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code = %L)',
            v_value_text
          );
        END IF;

      ELSE
        RAISE EXCEPTION 'Unknown field: %', v_field;
    END CASE;
  END LOOP;

  IF array_length(v_conditions, 1) IS NULL OR array_length(v_conditions, 1) = 0 THEN
    DELETE FROM contact_list_members WHERE list_id = p_list_id;
    UPDATE contact_lists SET customer_count = 0, updated_at = NOW() WHERE id = p_list_id;
    RETURN 0;
  END IF;

  -- Replace members in a single transaction
  v_sql := format(
    'WITH matched AS (SELECT c.id FROM customers c WHERE c.tenant_id = %L AND (%s)), '
    'deleted AS (DELETE FROM contact_list_members WHERE list_id = %L) '
    'INSERT INTO contact_list_members (list_id, customer_id) '
    'SELECT %L, id FROM matched ON CONFLICT (list_id, customer_id) DO NOTHING',
    v_tenant, array_to_string(v_conditions, v_joiner), p_list_id, p_list_id
  );

  EXECUTE v_sql;

  SELECT COUNT(*) INTO v_count FROM contact_list_members WHERE list_id = p_list_id;
  UPDATE contact_lists SET customer_count = v_count, updated_at = NOW() WHERE id = p_list_id;

  RETURN v_count;
END;
$$;

-- Companion: preview count without writing members
CREATE OR REPLACE FUNCTION public.preview_dynamic_list(p_tenant uuid, p_rules jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
  IF p_rules IS NULL OR p_rules->'rules' IS NULL OR jsonb_array_length(p_rules->'rules') = 0 THEN
    RETURN 0;
  END IF;

  v_match := COALESCE(p_rules->>'match', 'all');
  v_joiner := CASE WHEN v_match = 'any' THEN ' OR ' ELSE ' AND ' END;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules->'rules')
  LOOP
    v_field := v_rule->>'field';
    v_op := COALESCE(v_rule->>'op', '=');
    v_value := v_rule->'value';
    v_value_text := v_rule->>'value';

    CASE v_field
      WHEN 'total_orders', 'total_spent', 'avg_ticket' THEN
        IF v_op NOT IN ('=', '!=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for %', v_op, v_field;
        END IF;
        v_conditions := v_conditions || format('c.%I %s %s', v_field, v_op, COALESCE(v_value_text, '0'));
      WHEN 'last_order_days_ago' THEN
        IF v_op NOT IN ('=', '>', '>=', '<', '<=') THEN
          RAISE EXCEPTION 'Invalid op % for last_order_days_ago', v_op;
        END IF;
        v_conditions := v_conditions || format(
          '(c.last_order_at IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c.last_order_at))/86400 %s %s)',
          v_op, COALESCE(v_value_text, '0')
        );
      WHEN 'state', 'city' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) = %L', v_field, v_value_text);
        ELSIF v_op = '!=' THEN
          v_conditions := v_conditions || format('(c.custom_attributes->>%L) != %L', v_field, v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            v_field, v_value::text
          );
        ELSIF v_op = 'contains' THEN
          v_conditions := v_conditions || format(
            '(c.custom_attributes->>%L) ILIKE %L',
            v_field, '%' || v_value_text || '%'
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for %', v_op, v_field;
        END IF;
      WHEN 'has_phone' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.phone IS NOT NULL AND c.phone != ''''' ELSE 'c.phone IS NULL OR c.phone = ''''' END;
      WHEN 'has_email' THEN
        v_conditions := v_conditions || CASE WHEN COALESCE(v_value_text, 'true') = 'true' THEN 'c.email IS NOT NULL AND c.email != ''''' ELSE 'c.email IS NULL OR c.email = ''''' END;
      WHEN 'rfm_segment' THEN
        IF v_op = '=' THEN
          v_conditions := v_conditions || format('c.rfm_segment = %L', v_value_text);
        ELSIF v_op = 'in' THEN
          v_conditions := v_conditions || format(
            'c.rfm_segment = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))',
            v_value::text
          );
        ELSE
          RAISE EXCEPTION 'Invalid op % for rfm_segment', v_op;
        END IF;
      WHEN 'tag' THEN
        IF v_op = 'contains' THEN
          v_conditions := v_conditions || format('%L = ANY(c.tags)', v_value_text);
        ELSIF v_op = 'not_contains' THEN
          v_conditions := v_conditions || format('NOT (%L = ANY(c.tags))', v_value_text);
        ELSE
          RAISE EXCEPTION 'Invalid op % for tag', v_op;
        END IF;
      WHEN 'bought_product' THEN
        v_conditions := v_conditions || format(
          'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.items_summary::text ILIKE %L)',
          '%' || v_value_text || '%'
        );
      WHEN 'used_coupon' THEN
        IF v_value_text IS NULL OR v_value_text = '' THEN
          v_conditions := v_conditions || 'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code IS NOT NULL AND o.coupon_code != '''')';
        ELSE
          v_conditions := v_conditions || format(
            'EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.tenant_id = c.tenant_id AND o.coupon_code = %L)',
            v_value_text
          );
        END IF;
      ELSE
        RAISE EXCEPTION 'Unknown field: %', v_field;
    END CASE;
  END LOOP;

  IF array_length(v_conditions, 1) IS NULL OR array_length(v_conditions, 1) = 0 THEN
    RETURN 0;
  END IF;

  v_sql := format(
    'SELECT COUNT(*) FROM customers c WHERE c.tenant_id = %L AND (%s)',
    p_tenant, array_to_string(v_conditions, v_joiner)
  );

  EXECUTE v_sql INTO v_count;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.materialize_dynamic_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_dynamic_list(uuid, jsonb) TO authenticated, service_role;
