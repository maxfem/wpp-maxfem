-- Function to recompute the customer_count of a single list
CREATE OR REPLACE FUNCTION public.recompute_contact_list_count(_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contact_lists cl
  SET customer_count = (
    SELECT COUNT(*) FROM public.contact_list_members m WHERE m.list_id = _list_id
  ),
  updated_at = now()
  WHERE cl.id = _list_id;
END;
$$;

-- Trigger function reacting to inserts/deletes on contact_list_members
CREATE OR REPLACE FUNCTION public.trg_sync_contact_list_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_contact_list_count(NEW.list_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_contact_list_count(OLD.list_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.list_id IS DISTINCT FROM OLD.list_id THEN
      PERFORM public.recompute_contact_list_count(OLD.list_id);
      PERFORM public.recompute_contact_list_count(NEW.list_id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contact_list_members_count_sync ON public.contact_list_members;
CREATE TRIGGER contact_list_members_count_sync
AFTER INSERT OR UPDATE OR DELETE ON public.contact_list_members
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_contact_list_count();

-- Backfill all existing list counts so the UI shows accurate numbers immediately
UPDATE public.contact_lists cl
SET customer_count = sub.cnt,
    updated_at = now()
FROM (
  SELECT list_id, COUNT(*) AS cnt
  FROM public.contact_list_members
  GROUP BY list_id
) sub
WHERE cl.id = sub.list_id;

-- Lists with zero members should also be reset to 0
UPDATE public.contact_lists cl
SET customer_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.contact_list_members m WHERE m.list_id = cl.id
)
AND COALESCE(cl.customer_count, 0) <> 0;