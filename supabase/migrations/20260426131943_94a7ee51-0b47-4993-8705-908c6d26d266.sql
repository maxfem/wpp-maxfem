ALTER TABLE public.campaign_activities 
ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN public.campaign_activities.error_message IS 'Mensagem de erro detalhada caso a atividade falhe.';