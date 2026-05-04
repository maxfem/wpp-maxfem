-- A/B Testing Support
ALTER TABLE public.campaigns 
ADD COLUMN is_ab_test BOOLEAN DEFAULT false,
ADD COLUMN ab_test_config JSONB DEFAULT '{
  "variants": [],
  "winner_criteria": "open_rate",
  "test_duration_hours": 24,
  "winning_variant_id": null
}';

ALTER TABLE public.email_logs ADD COLUMN ab_variant_id UUID;
ALTER TABLE public.whatsapp_messages ADD COLUMN ab_variant_id UUID;

-- Send Time Optimization (STO) Support
CREATE TABLE public.customer_engagement_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    hour_of_day INTEGER CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
    weight INTEGER DEFAULT 0,
    last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(customer_id, hour_of_day)
);

ALTER TABLE public.customer_engagement_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view engagement hours of their tenant" ON public.customer_engagement_hours
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.tenant_members WHERE tenant_id = customer_engagement_hours.tenant_id));

-- Chat SLA & Workflow Support
CREATE TABLE public.chat_sla_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
    target_response_time_minutes INTEGER DEFAULT 30,
    target_resolution_time_hours INTEGER DEFAULT 24,
    business_hours JSONB DEFAULT '{
      "mon": {"start": "08:00", "end": "18:00"},
      "tue": {"start": "08:00", "end": "18:00"},
      "wed": {"start": "08:00", "end": "18:00"},
      "thu": {"start": "08:00", "end": "18:00"},
      "fri": {"start": "08:00", "end": "18:00"},
      "sat": null,
      "sun": null
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.chat_sla_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage SLA configs of their tenant" ON public.chat_sla_configs
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.tenant_members WHERE tenant_id = chat_sla_configs.tenant_id));

-- Add workflow fields to messages (if not already present)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'whatsapp_messages' AND COLUMN_NAME = 'assigned_to') THEN
        ALTER TABLE public.whatsapp_messages ADD COLUMN assigned_to UUID REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'whatsapp_messages' AND COLUMN_NAME = 'ticket_status') THEN
        ALTER TABLE public.whatsapp_messages ADD COLUMN ticket_status TEXT DEFAULT 'open' CHECK (ticket_status IN ('open', 'pending', 'resolved', 'closed'));
    END IF;
END $$;

-- Function to record engagement
CREATE OR REPLACE FUNCTION public.record_customer_engagement()
RETURNS TRIGGER AS $$
DECLARE
    v_hour INTEGER;
BEGIN
    v_hour := EXTRACT(HOUR FROM COALESCE(NEW.sent_at, NEW.created_at));
    
    INSERT INTO public.customer_engagement_hours (tenant_id, customer_id, hour_of_day, weight)
    VALUES (NEW.tenant_id, NEW.customer_id, v_hour, 1)
    ON CONFLICT (customer_id, hour_of_day)
    DO UPDATE SET 
        weight = customer_engagement_hours.weight + 1,
        last_interaction_at = now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for email interactions (opens/clicks should record engagement)
CREATE TRIGGER tr_record_email_engagement
AFTER UPDATE OF opens, clicks ON public.email_logs
FOR EACH ROW
WHEN (NEW.opens > OLD.opens OR NEW.clicks > OLD.clicks)
EXECUTE FUNCTION public.record_customer_engagement();

-- Trigger for WhatsApp interactions (inbound messages should record engagement)
CREATE OR REPLACE FUNCTION public.record_wa_engagement()
RETURNS TRIGGER AS $$
DECLARE
    v_hour INTEGER;
BEGIN
    IF NEW.direction = 'inbound' THEN
        v_hour := EXTRACT(HOUR FROM NEW.created_at);
        INSERT INTO public.customer_engagement_hours (tenant_id, customer_id, hour_of_day, weight)
        VALUES (NEW.tenant_id, NEW.customer_id, v_hour, 1)
        ON CONFLICT (customer_id, hour_of_day)
        DO UPDATE SET 
            weight = customer_engagement_hours.weight + 1,
            last_interaction_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_record_wa_engagement
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.record_wa_engagement();
