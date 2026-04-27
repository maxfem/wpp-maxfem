-- Tabela para logs de e-mails enviados (transacionais e marketing)
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, failed
    aws_message_id TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Tabela para campanhas de marketing por e-mail
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    content_html TEXT NOT NULL,
    target_segment JSONB, -- Filtros de audiência
    status TEXT DEFAULT 'draft', -- draft, scheduled, processing, completed
    scheduled_for TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- Políticas para logs
CREATE POLICY "Users can view their own email logs"
ON public.email_logs FOR SELECT
USING (auth.uid() = user_id);

-- Políticas para campanhas
CREATE POLICY "Users can manage their own campaigns"
ON public.email_campaigns FOR ALL
USING (auth.uid() = user_id);

-- Trigger para updated_at em campanhas
CREATE TRIGGER update_email_campaigns_updated_at
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();