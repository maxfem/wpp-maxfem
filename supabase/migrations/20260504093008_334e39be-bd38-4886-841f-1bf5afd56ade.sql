-- Add predictive scoring fields to customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS churn_probability FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS predicted_clv DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scoring_at TIMESTAMP WITH TIME ZONE;

-- Add fallback configuration to campaigns
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS fallback_channel TEXT,
ADD COLUMN IF NOT EXISTS fallback_delay_minutes INTEGER DEFAULT 60;

-- Create predictive scoring history for tracking
CREATE TABLE IF NOT EXISTS public.predictive_scores_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    score_type TEXT NOT NULL, -- 'churn', 'clv', etc.
    score_value FLOAT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.predictive_scores_history ENABLE ROW LEVEL SECURITY;

-- Policies for predictive_scores_history
CREATE POLICY "Users can view their own tenant scoring history"
ON public.predictive_scores_history
FOR SELECT
USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
));

-- Function to handle fallback check (logic for executor)
CREATE OR REPLACE FUNCTION public.check_campaign_fallback()
RETURNS TRIGGER AS $$
BEGIN
    -- If a campaign activity failed or wasn't read within fallback delay, 
    -- the executor will handle it. This trigger could log or notify.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
