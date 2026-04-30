-- Create email suppressions table
CREATE TABLE IF NOT EXISTS public.email_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    reason TEXT DEFAULT 'unsubscribe', -- unsubscribe, bounce, complaint
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, email)
);

-- Enable RLS
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view suppressions for their tenants"
ON public.email_suppressions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_members.tenant_id = email_suppressions.tenant_id
        AND tenant_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert suppressions for their tenants"
ON public.email_suppressions
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_members.tenant_id = email_suppressions.tenant_id
        AND tenant_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete suppressions for their tenants"
ON public.email_suppressions
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_members.tenant_id = email_suppressions.tenant_id
        AND tenant_members.user_id = auth.uid()
    )
);

-- Allow service role to manage everything
CREATE POLICY "Service role can manage all suppressions"
ON public.email_suppressions
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');
