
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule(
  'sync-template-status-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://poukhwsbskcvwroeqoct.supabase.co/functions/v1/cron-sync-template-status',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvdWtod3Nic2tjdndyb2Vxb2N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTI4MTEsImV4cCI6MjA5MTA2ODgxMX0.H7dYUtxllEWMoYYbOVDu51Fqe7ggY7ehEptFb8VxToo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
