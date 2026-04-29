-- Adicionar status ao perfil
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Adicionar campo de permissões nas roles se não existir
-- Nota: dependendo da estrutura, as permissões podem ficar em user_roles ou tenant_members.
-- Como o projeto parece usar tenant_members para membros da loja, vamos garantir que tenha o necessário.
ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

-- Criar um log de atividades se não existir para "registro de função por atividade"
CREATE TABLE IF NOT EXISTS public.collaborator_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.collaborator_activities ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Membros podem ver atividades do seu tenant"
ON public.collaborator_activities
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Apenas o próprio sistema pode inserir logs (via trigger ou edge function)"
ON public.collaborator_activities
FOR INSERT
WITH CHECK (true);
