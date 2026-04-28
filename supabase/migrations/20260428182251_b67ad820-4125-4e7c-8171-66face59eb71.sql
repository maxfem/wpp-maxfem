-- Create email_templates table
CREATE TABLE public.email_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    design JSONB, -- For storing email builder state if needed
    category TEXT DEFAULT 'marketing',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own tenant's email templates"
ON public.email_templates
FOR SELECT
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert their own tenant's email templates"
ON public.email_templates
FOR INSERT
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own tenant's email templates"
ON public.email_templates
FOR UPDATE
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their own tenant's email templates"
ON public.email_templates
FOR DELETE
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
