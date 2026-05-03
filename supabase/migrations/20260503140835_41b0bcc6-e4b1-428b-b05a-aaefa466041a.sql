DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
        CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  type TEXT NOT NULL, 
  status job_status NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  payload JSONB, 
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant's background jobs" ON public.background_jobs;
CREATE POLICY "Users can view their tenant's background jobs"
ON public.background_jobs
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create background jobs for their tenant" ON public.background_jobs;
CREATE POLICY "Users can create background jobs for their tenant"
ON public.background_jobs
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update their tenant's background jobs" ON public.background_jobs;
CREATE POLICY "Users can update their tenant's background jobs"
ON public.background_jobs
FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_background_jobs_updated_at ON public.background_jobs;
CREATE TRIGGER update_background_jobs_updated_at
BEFORE UPDATE ON public.background_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();