-- Add tracking columns to email_logs
ALTER TABLE public.email_logs 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id),
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON public.email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_customer_id ON public.email_logs(customer_id);

-- Ensure RLS is updated if needed (usually it's already enabled and handled by tenant_id)
