-- Refresh all dynamic lists in batch.
-- Returns: jsonb { total_lists, total_members, errors[] }
CREATE OR REPLACE FUNCTION public.refresh_all_dynamic_lists()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_list record;
  v_total_lists int := 0;
  v_total_members int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_count int;
BEGIN
  FOR v_list IN
    SELECT id, name, tenant_id
    FROM contact_lists
    WHERE type = 'dynamic'
      AND filter_rules IS NOT NULL
      AND jsonb_array_length(filter_rules->'rules') > 0
  LOOP
    BEGIN
      v_count := public.materialize_dynamic_list(v_list.id);
      v_total_lists := v_total_lists + 1;
      v_total_members := v_total_members + COALESCE(v_count, 0);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'list_id', v_list.id,
        'list_name', v_list.name,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'total_lists', v_total_lists,
    'total_members', v_total_members,
    'errors', v_errors,
    'ran_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_all_dynamic_lists() TO service_role;

-- Schedule: every 6 hours (00:23, 06:23, 12:23, 18:23 UTC = 21:23/03:23/09:23/15:23 BRT)
-- Offset minute 23 to avoid colliding with other crons (none on :23)
SELECT cron.schedule(
  'refresh-dynamic-lists-6h',
  '23 */6 * * *',
  $$SELECT public.refresh_all_dynamic_lists();$$
);
