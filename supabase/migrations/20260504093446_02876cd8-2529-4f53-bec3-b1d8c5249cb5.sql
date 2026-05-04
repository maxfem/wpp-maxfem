-- Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- e.g., 'INSERT', 'UPDATE', 'DELETE'
    entity TEXT NOT NULL, -- e.g., 'campaigns'
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view audit logs of their tenant" ON public.audit_logs
    FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

-- Role Permissions Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL, -- 'owner', 'admin', 'manager', 'agent', 'viewer'
    permission TEXT NOT NULL, -- e.g., 'campaigns.create', 'settings.edit'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(role, permission)
);

-- Seed basic permissions
INSERT INTO public.role_permissions (role, permission) VALUES
    ('owner', 'all'),
    ('admin', 'campaigns.all'), ('admin', 'contacts.all'), ('admin', 'settings.view'), ('admin', 'reports.view'),
    ('manager', 'campaigns.all'), ('manager', 'contacts.view'), ('manager', 'reports.view'),
    ('agent', 'chat.reply'), ('agent', 'contacts.view'),
    ('viewer', 'reports.view')
ON CONFLICT DO NOTHING;

-- Outbound Webhooks Table
CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret_token TEXT,
    events TEXT[] DEFAULT '{}', -- ['message.delivered', 'campaign.completed', etc]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their tenant webhooks" ON public.outbound_webhooks
    FOR ALL USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

-- Sandbox Mode in Campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;

-- Audit Trigger Function
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    -- Try to find tenant_id from the record
    IF (TG_OP = 'DELETE') THEN
        BEGIN v_tenant_id := OLD.tenant_id; EXCEPTION WHEN OTHERS THEN v_tenant_id := NULL; END;
    ELSE
        BEGIN v_tenant_id := NEW.tenant_id; EXCEPTION WHEN OTHERS THEN v_tenant_id := NULL; END;
    END IF;

    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        entity,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_tenant_id,
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply Audit Triggers to critical tables
DROP TRIGGER IF EXISTS audit_campaigns ON public.campaigns;
CREATE TRIGGER audit_campaigns AFTER INSERT OR UPDATE OR DELETE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_message_templates ON public.message_templates;
CREATE TRIGGER audit_message_templates AFTER INSERT OR UPDATE OR DELETE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_integrations ON public.integrations;
CREATE TRIGGER audit_integrations AFTER INSERT OR UPDATE OR DELETE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_whatsapp_accounts ON public.whatsapp_accounts;
CREATE TRIGGER audit_whatsapp_accounts AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_accounts FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
