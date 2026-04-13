
-- Function to calculate RFM scores for all customers of a tenant
CREATE OR REPLACE FUNCTION public.calculate_rfm_scores(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH stats AS (
    SELECT
      customer_id,
      EXTRACT(DAY FROM now() - MAX(created_at))::int AS recency_days,
      COUNT(*)::int AS frequency,
      COALESCE(SUM(total), 0) AS monetary
    FROM orders
    WHERE tenant_id = _tenant_id
    GROUP BY customer_id
  ),
  scored AS (
    SELECT
      customer_id,
      recency_days,
      frequency,
      monetary,
      NTILE(5) OVER (ORDER BY recency_days DESC) AS r,
      NTILE(5) OVER (ORDER BY frequency ASC) AS f,
      NTILE(5) OVER (ORDER BY monetary ASC) AS m
    FROM stats
  )
  UPDATE customers c SET
    rfm_recency = s.r,
    rfm_frequency = s.f,
    rfm_monetary = s.m,
    rfm_segment = CASE
      WHEN s.r >= 4 AND s.f >= 4 AND s.m >= 4 THEN 'Campeões'
      WHEN s.r >= 3 AND s.f >= 3 AND s.m >= 3 THEN 'Leais'
      WHEN s.r <= 2 AND s.f >= 3 THEN 'Em Risco'
      WHEN s.r <= 2 AND s.f <= 2 THEN 'Hibernando'
      ELSE 'Potenciais'
    END,
    updated_at = now()
  FROM scored s
  WHERE c.id = s.customer_id
    AND c.tenant_id = _tenant_id;
END;
$$;

-- Function to sync RFM contact lists
CREATE OR REPLACE FUNCTION public.sync_rfm_lists(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seg_name text;
  list_uuid uuid;
  seg_count int;
  segments text[] := ARRAY['Campeões', 'Leais', 'Potenciais', 'Em Risco', 'Hibernando'];
BEGIN
  FOREACH seg_name IN ARRAY segments LOOP
    -- Upsert the contact list for this segment
    SELECT id INTO list_uuid
    FROM contact_lists
    WHERE tenant_id = _tenant_id AND type = 'rfm' AND name = 'RFM — ' || seg_name;

    IF list_uuid IS NULL THEN
      INSERT INTO contact_lists (tenant_id, name, type, description)
      VALUES (_tenant_id, 'RFM — ' || seg_name, 'rfm', 'Lista automática de clientes no segmento ' || seg_name)
      RETURNING id INTO list_uuid;
    END IF;

    -- Clear existing members
    DELETE FROM contact_list_members WHERE list_id = list_uuid;

    -- Insert current members
    INSERT INTO contact_list_members (list_id, customer_id)
    SELECT list_uuid, id
    FROM customers
    WHERE tenant_id = _tenant_id AND rfm_segment = seg_name;

    -- Update count
    SELECT COUNT(*) INTO seg_count
    FROM contact_list_members WHERE list_id = list_uuid;

    UPDATE contact_lists
    SET customer_count = seg_count, updated_at = now()
    WHERE id = list_uuid;
  END LOOP;
END;
$$;
