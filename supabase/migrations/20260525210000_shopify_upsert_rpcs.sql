-- Shopify sync upsert RPCs — fazem o trabalho pesado no Postgres em vez da
-- edge function (que estourava memória + CPU com dedup em JS).
--
-- Idempotentes: chame quantas vezes quiser, mesma página → mesmo resultado.

-- ===== customers =====
-- Aceita array de objetos { email, phone, name, custom_attributes (jsonb) }.
-- Dedup: email → phone → shopify_id em custom_attributes (last).
-- Merge: custom_attributes existente || novo (novo sobrescreve chaves repetidas).
CREATE OR REPLACE FUNCTION public.upsert_shopify_customers(
  _tenant_id uuid,
  _customers jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_email text;
  v_phone text;
  v_name text;
  v_attrs jsonb;
  v_shopify_id text;
  v_existing_id uuid;
  v_existing_attrs jsonb;
  v_ins int := 0;
  v_upd int := 0;
  v_merged int := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(_customers)
  LOOP
    v_email := NULLIF(LOWER(TRIM(v_item->>'email')), '');
    v_phone := NULLIF(v_item->>'phone', '');
    v_name  := COALESCE(NULLIF(v_item->>'name', ''), v_email, 'Cliente Shopify');
    v_attrs := COALESCE(v_item->'custom_attributes', '{}'::jsonb);
    v_shopify_id := v_attrs->>'shopify_id';

    v_existing_id := NULL;
    v_existing_attrs := NULL;

    -- Lookup 1: shopify_id (índice idx_customers_shopify_id)
    IF v_shopify_id IS NOT NULL THEN
      SELECT id, custom_attributes INTO v_existing_id, v_existing_attrs
      FROM customers
      WHERE tenant_id = _tenant_id
        AND custom_attributes->>'shopify_id' = v_shopify_id
      LIMIT 1;
    END IF;

    -- Lookup 2: email (índice unique customers_tenant_email_key)
    IF v_existing_id IS NULL AND v_email IS NOT NULL THEN
      SELECT id, custom_attributes INTO v_existing_id, v_existing_attrs
      FROM customers
      WHERE tenant_id = _tenant_id AND email = v_email
      LIMIT 1;
      IF v_existing_id IS NOT NULL THEN v_merged := v_merged + 1; END IF;
    END IF;

    -- Lookup 3: phone (índice unique customers_tenant_phone_key)
    IF v_existing_id IS NULL AND v_phone IS NOT NULL THEN
      SELECT id, custom_attributes INTO v_existing_id, v_existing_attrs
      FROM customers
      WHERE tenant_id = _tenant_id AND phone = v_phone
      LIMIT 1;
      IF v_existing_id IS NOT NULL THEN v_merged := v_merged + 1; END IF;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE customers SET
        name = v_name,
        email = COALESCE(v_email, email),
        phone = COALESCE(v_phone, phone),
        custom_attributes = COALESCE(v_existing_attrs, '{}'::jsonb) || v_attrs,
        updated_at = NOW()
      WHERE id = v_existing_id;
      v_upd := v_upd + 1;
    ELSE
      -- INSERT — pode dar conflict em UNIQUE(tenant, email/phone) por race.
      -- ON CONFLICT vira UPDATE com merge.
      INSERT INTO customers (tenant_id, name, email, phone, custom_attributes)
      VALUES (_tenant_id, v_name, v_email, v_phone, v_attrs)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_ins := v_ins + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_ins,
    'updated', v_upd,
    'merged', v_merged
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shopify_customers(uuid, jsonb) TO authenticated, service_role;


-- ===== orders =====
-- Aceita array de objetos { external_id, ... fields, customer_email, customer_phone, customer_shopify_id, customer_name }.
-- 1. Resolve customer_id (shopify_id → email → phone).
-- 2. Se não existe, cria stub.
-- 3. Upsert por (tenant_id, external_id).
CREATE OR REPLACE FUNCTION public.upsert_shopify_orders(
  _tenant_id uuid,
  _orders jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_external_id text;
  v_customer_id uuid;
  v_existing_order_id uuid;
  v_email text;
  v_phone text;
  v_shopify_id text;
  v_name text;
  v_ins int := 0;
  v_upd int := 0;
  v_cust_ins int := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(_orders)
  LOOP
    v_external_id := v_item->>'external_id';
    IF v_external_id IS NULL THEN CONTINUE; END IF;

    v_email := NULLIF(LOWER(TRIM(v_item->>'customer_email')), '');
    v_phone := NULLIF(v_item->>'customer_phone', '');
    v_shopify_id := NULLIF(v_item->>'customer_shopify_id', '');
    v_name := COALESCE(NULLIF(v_item->>'customer_name', ''), v_email, 'Cliente Shopify');

    -- Resolve customer_id
    v_customer_id := NULL;
    IF v_shopify_id IS NOT NULL THEN
      SELECT id INTO v_customer_id FROM customers
      WHERE tenant_id = _tenant_id AND custom_attributes->>'shopify_id' = v_shopify_id LIMIT 1;
    END IF;
    IF v_customer_id IS NULL AND v_email IS NOT NULL THEN
      SELECT id INTO v_customer_id FROM customers
      WHERE tenant_id = _tenant_id AND email = v_email LIMIT 1;
    END IF;
    IF v_customer_id IS NULL AND v_phone IS NOT NULL THEN
      SELECT id INTO v_customer_id FROM customers
      WHERE tenant_id = _tenant_id AND phone = v_phone LIMIT 1;
    END IF;

    -- Cria stub se ainda não existe
    IF v_customer_id IS NULL AND (v_email IS NOT NULL OR v_phone IS NOT NULL) THEN
      INSERT INTO customers (tenant_id, name, email, phone, custom_attributes)
      VALUES (
        _tenant_id, v_name, v_email, v_phone,
        jsonb_build_object(
          'shopify_id', v_shopify_id,
          'source', 'shopify',
          'created_from_order', true
        )
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_customer_id;

      -- Se conflict, busca de novo
      IF v_customer_id IS NULL THEN
        IF v_email IS NOT NULL THEN
          SELECT id INTO v_customer_id FROM customers
          WHERE tenant_id = _tenant_id AND email = v_email LIMIT 1;
        END IF;
        IF v_customer_id IS NULL AND v_phone IS NOT NULL THEN
          SELECT id INTO v_customer_id FROM customers
          WHERE tenant_id = _tenant_id AND phone = v_phone LIMIT 1;
        END IF;
      ELSE
        v_cust_ins := v_cust_ins + 1;
      END IF;
    END IF;

    -- Upsert do pedido
    SELECT id INTO v_existing_order_id FROM orders
    WHERE tenant_id = _tenant_id AND external_id = v_external_id LIMIT 1;

    IF v_existing_order_id IS NOT NULL THEN
      UPDATE orders SET
        customer_id    = COALESCE(v_customer_id, customer_id),
        order_number   = v_item->>'order_number',
        total          = COALESCE((v_item->>'total')::numeric, 0),
        status         = v_item->>'status',
        status_alias   = v_item->>'status_alias',
        mapped_status  = v_item->>'mapped_status',
        created_at     = COALESCE((v_item->>'created_at')::timestamptz, created_at),
        updated_at     = NOW(),
        tracking_code  = v_item->>'tracking_code',
        tracking_url   = v_item->>'tracking_url',
        carrier        = v_item->>'carrier',
        items_summary  = COALESCE(v_item->'items_summary', '[]'::jsonb),
        payment_summary= COALESCE(v_item->'payment_summary', '{}'::jsonb),
        utm_source     = v_item->>'utm_source',
        coupon_code    = v_item->>'coupon_code'
      WHERE id = v_existing_order_id;
      v_upd := v_upd + 1;
    ELSE
      INSERT INTO orders (
        tenant_id, customer_id, external_id, order_number, total, status, status_alias, mapped_status,
        created_at, updated_at, tracking_code, tracking_url, carrier,
        items_summary, payment_summary, utm_source, coupon_code
      ) VALUES (
        _tenant_id, v_customer_id, v_external_id, v_item->>'order_number',
        COALESCE((v_item->>'total')::numeric, 0),
        v_item->>'status', v_item->>'status_alias', v_item->>'mapped_status',
        COALESCE((v_item->>'created_at')::timestamptz, NOW()), NOW(),
        v_item->>'tracking_code', v_item->>'tracking_url', v_item->>'carrier',
        COALESCE(v_item->'items_summary', '[]'::jsonb),
        COALESCE(v_item->'payment_summary', '{}'::jsonb),
        v_item->>'utm_source', v_item->>'coupon_code'
      )
      ON CONFLICT (tenant_id, external_id) DO NOTHING;
      IF FOUND THEN v_ins := v_ins + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'orders_inserted', v_ins,
    'orders_updated', v_upd,
    'customers_inserted', v_cust_ins
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shopify_orders(uuid, jsonb) TO authenticated, service_role;

-- Garantia: UNIQUE em (tenant_id, external_id) pra ON CONFLICT funcionar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_external_id_key'
  ) THEN
    BEGIN
      ALTER TABLE orders ADD CONSTRAINT orders_tenant_external_id_key UNIQUE (tenant_id, external_id);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Não foi possível criar UNIQUE (tenant, external_id) — há duplicatas existentes';
    END;
  END IF;
END $$;
