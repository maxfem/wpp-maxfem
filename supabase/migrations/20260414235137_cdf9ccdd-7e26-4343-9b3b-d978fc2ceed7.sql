UPDATE public.integrations
SET last_synced_at = now() - interval '2 hours',
    sync_status = 'pending',
    sync_error = null
WHERE provider = 'yampi' AND is_active = true;