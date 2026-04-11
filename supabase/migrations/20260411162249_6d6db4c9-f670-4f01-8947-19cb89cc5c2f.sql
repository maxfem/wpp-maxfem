
ALTER TABLE public.campaigns ADD COLUMN kind TEXT NOT NULL DEFAULT 'campaign';

UPDATE public.campaigns SET kind = 'automation' WHERE trigger_type IS NOT NULL;

CREATE INDEX idx_campaigns_kind ON public.campaigns(kind);
