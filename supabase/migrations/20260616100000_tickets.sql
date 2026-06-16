-- Sistema de tickets do CRM atendimento — integração com ClickUp + e-mail.
--
-- Fluxo:
--   1. Atendente clica "Criar ticket" em /crm/atendimento
--   2. edge fn ticket-create insere em tickets, chama ClickUp API pra criar task
--      na lista "Painel - Atendimento" (Space SAC > Gestão de Reclamações),
--      envia mensagem na conversa (WA/IG) e dispara email ticket_created.
--   3. SAC trabalha no ClickUp. Webhook ClickUp → clickup-webhook (edge fn)
--      identifica ticket por clickup_task_id, atualiza status local, envia email
--      apropriado (ticket_status_changed ou ticket_resolved).
--
-- Mapping ClickUp → ticket.status:
--   para fazer      → open
--   em atendimento  → in_progress
--   em análise      → waiting
--   finalizado      → resolved

BEGIN;

-- =====================================================================
-- Sequência humana TKT-00001
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS public.tickets_number_seq START 1 MINVALUE 1;

CREATE OR REPLACE FUNCTION public.next_ticket_number()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'TKT-' || lpad(nextval('public.tickets_number_seq')::text, 5, '0');
$$;

-- =====================================================================
-- tickets
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_number   text NOT NULL UNIQUE DEFAULT public.next_ticket_number(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  conversation_id uuid,  -- whatsapp_conversation ou instagram_conversation (nullable)
  channel         text NOT NULL CHECK (channel IN ('whatsapp','instagram','email','manual')),
  opened_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category        text NOT NULL DEFAULT 'outros'
    CHECK (category IN ('reembolso','defeito','atraso_entrega','duvida_produto','outros')),
  priority        text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
  title           text NOT NULL,
  description     text,
  clickup_task_id text UNIQUE,
  clickup_url     text,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_created
  ON public.tickets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_customer
  ON public.tickets (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_conversation
  ON public.tickets (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_status
  ON public.tickets (tenant_id, status) WHERE status NOT IN ('resolved','closed');
CREATE INDEX IF NOT EXISTS idx_tickets_clickup_task
  ON public.tickets (clickup_task_id) WHERE clickup_task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tickets_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  -- timestamps de transição
  IF NEW.status = 'resolved' AND COALESCE(OLD.status, '') <> 'resolved' THEN
    NEW.resolved_at = now();
  END IF;
  IF NEW.status = 'closed' AND COALESCE(OLD.status, '') <> 'closed' THEN
    NEW.closed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_touch ON public.tickets;
CREATE TRIGGER trg_tickets_touch
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_touch_updated();

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_select ON public.tickets
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY tickets_modify ON public.tickets
  FOR ALL USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- =====================================================================
-- ticket_updates (log)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ticket_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('agent','customer','system','clickup_webhook')),
  update_type  text NOT NULL CHECK (update_type IN ('created','status_change','comment','assigned','priority_change','closed','reopened','email_sent')),
  old_value    text,
  new_value    text,
  message      text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_updates_ticket
  ON public.ticket_updates (ticket_id, created_at DESC);

ALTER TABLE public.ticket_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_updates_select ON public.ticket_updates
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_updates.ticket_id
      AND public.is_tenant_member(auth.uid(), t.tenant_id)
  ));

-- =====================================================================
-- tenant_settings: armazena IDs ClickUp por tenant (folder, list, mapeamentos)
-- Reusa tabela existente se houver; senão cria simples key/value
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ticket_tenant_config (
  tenant_id              uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  clickup_list_id        text NOT NULL,        -- 901327582157 (Painel - Atendimento)
  clickup_workspace_id   text NOT NULL,        -- 90132851441 (Maxfem)
  -- Mapping ClickUp status name → status interno
  status_map             jsonb NOT NULL DEFAULT jsonb_build_object(
    'para fazer',      'open',
    'em atendimento',  'in_progress',
    'em análise',      'waiting',
    'finalizado',      'resolved'
  ),
  enabled                boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_tenant_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_tenant_config_select ON public.ticket_tenant_config
  FOR SELECT USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Seed pra Maxfem
INSERT INTO public.ticket_tenant_config (tenant_id, clickup_list_id, clickup_workspace_id)
VALUES (
  '317243f9-565c-43c2-adcc-849038c65f72',
  '901327582157',  -- Painel - Atendimento
  '90132851441'    -- Maxfem
)
ON CONFLICT (tenant_id) DO UPDATE SET
  clickup_list_id = EXCLUDED.clickup_list_id,
  clickup_workspace_id = EXCLUDED.clickup_workspace_id;

-- =====================================================================
-- 3 templates de e-mail (rosa Maxfem padrão dos outros)
-- =====================================================================
DELETE FROM public.message_templates
WHERE tenant_id = '317243f9-565c-43c2-adcc-849038c65f72'
  AND name IN ('ticket_created','ticket_status_changed','ticket_resolved');

INSERT INTO public.message_templates (tenant_id, name, channel, subject, preview_text, body_html, body_text, status, category)
VALUES
(
  '317243f9-565c-43c2-adcc-849038c65f72',
  'ticket_created',
  'email',
  'Recebemos seu chamado · {{ticket_number}}',
  'Abrimos o chamado {{ticket_number}} para o seu caso. Acompanhe por aqui.',
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:#fff1f5;font-family:Inter,Arial,sans-serif;color:#1a1322">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff1f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#ED2B75 0%,#C41E61 100%);padding:24px 40px;text-align:center">
<img src="https://brandbook-maxfem.vercel.app/assets/logo-branco.png" alt="Maxfem" height="32" style="height:32px;width:auto;display:inline-block">
</td></tr>
<tr><td style="padding:36px 44px 8px">
<span style="display:inline-block;background:#FCE4EF;color:#ED2B75;border-radius:100px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:6px 16px;margin-bottom:18px">Chamado aberto</span>
<h1 style="font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:700;line-height:1.25;margin:0 0 14px;color:#1a1322">Oi, {{first_name}}!<br>Recebemos seu <em style="color:#ED2B75;font-style:italic">chamado</em>.</h1>
<p style="font-size:15px;color:#4A4A5A;line-height:1.7;margin:0 0 16px">Abrimos o chamado <strong style="color:#1a1322">{{ticket_number}}</strong> com sua solicitação. Nosso time já está com ele em mãos e você vai receber novidades por aqui assim que houver progresso.</p>
<div style="background:linear-gradient(160deg,#fff8fa 0%,#ffe9f1 100%);border:1px solid #ffd6e4;border-radius:14px;padding:18px 22px;margin:18px 0">
<div style="font-size:11px;font-weight:700;color:#ED2B75;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Detalhes</div>
<div style="font-size:14px;color:#1a1322;line-height:1.7"><strong>{{ticket_title}}</strong></div>
<div style="font-size:13px;color:#4A4A5A;line-height:1.65;margin-top:6px">{{ticket_description}}</div>
</div>
<p style="font-size:13px;color:#8a8a96;line-height:1.65;margin:18px 0 4px">Se precisar adicionar algo, é só responder a conversa onde você abriu este chamado. A gente continua acompanhando por lá.</p>
<p style="margin:22px 0 4px;font-family:Fraunces,Georgia,serif;font-size:17px;color:#1a1322;font-style:italic">— Time Maxfem</p>
</td></tr>
<tr><td style="background:#1a1322;padding:30px 40px 24px;text-align:center">
<img src="https://brandbook-maxfem.vercel.app/assets/logo.png" alt="Maxfem" height="24" style="height:24px;filter:brightness(0) invert(1);margin-bottom:14px">
<p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0 0 6px">Saúde íntima feminina, sem tabu.</p>
<p style="font-size:10.5px;color:#6b7280;margin-top:10px">MAXFEM SAÚDE FEMININA LTDA · CNPJ 53.698.714/0001-81</p>
</td></tr>
</table></td></tr></table></body></html>',
  E'Oi, {{first_name}}!\n\nRecebemos seu chamado {{ticket_number}}.\n\n{{ticket_title}}\n{{ticket_description}}\n\nNosso time já está com ele em mãos e você vai receber novidades por aqui assim que houver progresso.\n\nSe precisar adicionar algo, é só responder a conversa onde você abriu este chamado.\n\n— Time Maxfem',
  'active',
  'transacional'
),
(
  '317243f9-565c-43c2-adcc-849038c65f72',
  'ticket_status_changed',
  'email',
  'Novidade no chamado {{ticket_number}}',
  'Seu chamado {{ticket_number}} mudou para "{{new_status_label}}".',
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:#fff1f5;font-family:Inter,Arial,sans-serif;color:#1a1322">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff1f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#ED2B75 0%,#C41E61 100%);padding:24px 40px;text-align:center">
<img src="https://brandbook-maxfem.vercel.app/assets/logo-branco.png" alt="Maxfem" height="32" style="height:32px;width:auto;display:inline-block">
</td></tr>
<tr><td style="padding:36px 44px 8px">
<span style="display:inline-block;background:#FCE4EF;color:#ED2B75;border-radius:100px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:6px 16px;margin-bottom:18px">Atualização</span>
<h1 style="font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:700;line-height:1.25;margin:0 0 14px;color:#1a1322">{{first_name}}, seu chamado<br>tem uma <em style="color:#ED2B75;font-style:italic">novidade</em>.</h1>
<p style="font-size:15px;color:#4A4A5A;line-height:1.7;margin:0 0 16px">Chamado <strong style="color:#1a1322">{{ticket_number}}</strong> agora está com status <strong style="color:#ED2B75">{{new_status_label}}</strong>.</p>
<div style="background:linear-gradient(160deg,#fff8fa 0%,#ffe9f1 100%);border:1px solid #ffd6e4;border-radius:14px;padding:18px 22px;margin:18px 0">
<div style="font-size:11px;font-weight:700;color:#ED2B75;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">O que isso significa</div>
<div style="font-size:14px;color:#1a1322;line-height:1.7">{{status_description}}</div>
</div>
<p style="font-size:13px;color:#8a8a96;line-height:1.65;margin:18px 0 4px">A gente segue acompanhando até a resolução. Se quiser falar com a gente, é só responder a conversa em que abriu o chamado.</p>
<p style="margin:22px 0 4px;font-family:Fraunces,Georgia,serif;font-size:17px;color:#1a1322;font-style:italic">— Time Maxfem</p>
</td></tr>
<tr><td style="background:#1a1322;padding:30px 40px 24px;text-align:center">
<img src="https://brandbook-maxfem.vercel.app/assets/logo.png" alt="Maxfem" height="24" style="height:24px;filter:brightness(0) invert(1);margin-bottom:14px">
<p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0 0 6px">Saúde íntima feminina, sem tabu.</p>
<p style="font-size:10.5px;color:#6b7280;margin-top:10px">MAXFEM SAÚDE FEMININA LTDA · CNPJ 53.698.714/0001-81</p>
</td></tr>
</table></td></tr></table></body></html>',
  E'Oi, {{first_name}}!\n\nNovidade no seu chamado {{ticket_number}}.\n\nStatus atual: {{new_status_label}}\n{{status_description}}\n\nA gente segue acompanhando até a resolução.\n\n— Time Maxfem',
  'active',
  'transacional'
),
(
  '317243f9-565c-43c2-adcc-849038c65f72',
  'ticket_resolved',
  'email',
  'Chamado {{ticket_number}} resolvido',
  'Seu chamado {{ticket_number}} foi finalizado pelo nosso time.',
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:#fff1f5;font-family:Inter,Arial,sans-serif;color:#1a1322">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff1f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#ED2B75 0%,#C41E61 100%);padding:24px 40px;text-align:center">
<img src="https://brandbook-maxfem.vercel.app/assets/logo-branco.png" alt="Maxfem" height="32" style="height:32px;width:auto;display:inline-block">
</td></tr>
<tr><td style="padding:36px 44px 8px">
<span style="display:inline-block;background:#dcfce7;color:#15803d;border-radius:100px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:6px 16px;margin-bottom:18px">Resolvido</span>
<h1 style="font-family:Fraunces,Georgia,serif;font-size:28px;font-weight:700;line-height:1.2;margin:0 0 14px;color:#1a1322">{{first_name}}, <em style="color:#ED2B75;font-style:italic">terminamos</em>!</h1>
<p style="font-size:15px;color:#4A4A5A;line-height:1.7;margin:0 0 16px">Seu chamado <strong style="color:#1a1322">{{ticket_number}}</strong> foi finalizado pelo nosso time.</p>
<div style="background:linear-gradient(160deg,#fff8fa 0%,#ffe9f1 100%);border:1px solid #ffd6e4;border-radius:14px;padding:18px 22px;margin:18px 0">
<div style="font-size:11px;font-weight:700;color:#ED2B75;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Resumo</div>
<div style="font-size:14px;color:#1a1322;line-height:1.7"><strong>{{ticket_title}}</strong></div>
<div style="font-size:13px;color:#4A4A5A;line-height:1.65;margin-top:8px">{{resolution_notes}}</div>
</div>
<p style="font-size:13px;color:#8a8a96;line-height:1.65;margin:18px 0 4px">Se o caso voltar ou você quiser conversar sobre algo relacionado, é só responder a conversa em que abriu o chamado e a gente reabre na hora.</p>
<p style="margin:22px 0 4px;font-family:Fraunces,Georgia,serif;font-size:17px;color:#1a1322;font-style:italic">— Time Maxfem</p>
</td></tr>
<tr><td style="background:#1a1322;padding:30px 40px 24px;text-align:center">
<img src="https://brandbook-maxfem.vercel.app/assets/logo.png" alt="Maxfem" height="24" style="height:24px;filter:brightness(0) invert(1);margin-bottom:14px">
<p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0 0 6px">Saúde íntima feminina, sem tabu.</p>
<p style="font-size:10.5px;color:#6b7280;margin-top:10px">MAXFEM SAÚDE FEMININA LTDA · CNPJ 53.698.714/0001-81</p>
</td></tr>
</table></td></tr></table></body></html>',
  E'Oi, {{first_name}}!\n\nTerminamos seu chamado {{ticket_number}}.\n\n{{ticket_title}}\n{{resolution_notes}}\n\nSe voltar ou quiser conversar sobre algo relacionado, é só responder a conversa em que abriu o chamado.\n\n— Time Maxfem',
  'active',
  'transacional'
);

COMMIT;
