
-- Add scheduled_at column to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Add list_id column to campaigns for linking a contact list
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.contact_lists(id) ON DELETE SET NULL;

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
