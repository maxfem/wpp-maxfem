UPDATE public.automation_queue
SET status = 'skipped', processed_at = now()
WHERE status = 'pending'
  AND created_at < (now() AT TIME ZONE 'UTC')::date;