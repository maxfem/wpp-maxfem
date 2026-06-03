# Automation Triggers — Sistema Completo

## Status: ✅ **ATIVO** (6/6 triggers implementados)

Sistema de gatilhos para automações do CRM Maxfem. Todos os 6 novos triggers foram ativados no frontend e têm implementação backend completa.

---

## Triggers Disponíveis

### 📦 **Logística & CRM**

#### 1. **Rastreio gerado** (`tracking_created`)
**Quando dispara:** Código de rastreio é gerado pela primeira vez para um pedido

**Dados disponíveis na automação:**
```json
{
  "order_id": "uuid",
  "tracking_code": "BR123456789BR",
  "carrier": "Correios",
  "created_at": "2026-05-14T12:00:00Z"
}
```

**Implementação:** `yampi-sync/index.ts` (linha ~501, ~911)
- Detecta quando `tracking_code` passa de `null` para valor
- Emite evento com detalhes do rastreio
- Funciona tanto no sync inicial quanto no refresh_tracking

**Exemplo de uso:**
- Enviar WhatsApp automático: "Seu pedido foi postado! Rastreie aqui: {tracking_url}"
- Atualizar status no Google Sheets
- Notificar equipe de logística

---

#### 2. **Rastreio atualizado** (`tracking_updated`)
**Quando dispara:** Status de rastreio muda (ex: "em trânsito" → "saiu para entrega")

**Dados disponíveis:**
```json
{
  "order_id": "uuid",
  "tracking_code": "BR123456789BR",
  "status": "shipped",
  "status_details": "Em trânsito",
  "updated_at": "2026-05-14T15:30:00Z"
}
```

**Implementação:** `yampi-sync/index.ts` (mesmos pontos do tracking_created)
- Detecta quando `tracking_code` muda de valor (atualização do código)
- Emite evento com novo status
- Útil para rastreio multi-etapa

**Exemplo de uso:**
- "Seu pedido saiu para entrega! Chega hoje."
- Sequência de updates progressivos
- Alerta quando status é "entregue"

---

#### 3. **Lead inserido na lista** (`lead_created`)
**Quando dispara:** Lead é adicionado a uma lista de contatos específica

**Dados disponíveis:**
```json
{
  "list_id": "uuid",
  "list_name": "Lista VIP",
  "source": "webhook",
  "created_at": "2026-05-14T10:00:00Z"
}
```

**Implementação:** `contact-list-webhook/index.ts` (linha ~167)
- Dispara quando webhook adiciona lead com sucesso
- Pode ser usado com qualquer lista (segmentação)

**Endpoint:** `POST /contact-list-webhook?list_id=<uuid>`

**Body:**
```json
{
  "name": "Maria Silva",
  "email": "maria@example.com",
  "phone": "11999999999",
  "document": "12345678900",
  "tags": ["vip", "interesse-produto-x"],
  "custom_attributes": { "origem": "formulario-site" }
}
```

**Exemplo de uso:**
- Sequência de onboarding para novos leads
- Enviar material educativo automaticamente
- Notificar vendedor quando lead VIP entra

---

#### 4. **Nova conversa WhatsApp** (`conversation_created`)
**Quando dispara:** Cliente envia primeira mensagem inbound no WhatsApp

**Dados disponíveis:**
```json
{
  "phone": "5511999999999",
  "first_message_id": "uuid",
  "created_at": "2026-05-14T14:20:00Z"
}
```

**Implementação:** `whatsapp-webhook/index.ts` (linha ~853)
- Detecta quando `count` de mensagens inbound do cliente = 1
- Dispara apenas na primeira interação
- Não dispara em respostas posteriores

**Exemplo de uso:**
- Mensagem de boas-vindas automática
- Adicionar lead a lista "Novos Contatos WhatsApp"
- Notificar atendente sobre novo lead quente

---

#### 5. **Conversa arquivada** (`conversation_archived`)
**Quando dispara:** Conversa WhatsApp é marcada como resolvida/arquivada

**Dados disponíveis:**
```json
{
  "phone": "5511999999999",
  "archived_reason": "resolved",
  "archived_at": "2026-05-14T16:45:00Z"
}
```

**Implementação:** `whatsapp-archive-conversation/index.ts`

**Endpoint:** `POST /whatsapp-archive-conversation`

**Body:**
```json
{
  "tenant_id": "uuid",
  "customer_id": "uuid",
  "phone": "5511999999999",
  "reason": "resolved"
}
```

**Exemplo de uso:**
- Enviar pesquisa de satisfação (CSAT)
- Pedir avaliação no Google/Reclame Aqui
- Oferecer cupom de desconto para próxima compra
- Adicionar a lista "Atendidos" para remarketing

---

#### 6. **Webhook customizado** (`webhook`)
**Quando dispara:** Sistema externo envia POST para endpoint customizado

**Dados disponíveis:**
```json
{
  "webhook_id": "zapier-integration",
  "payload": { /* qualquer JSON enviado */ },
  "received_at": "2026-05-14T11:00:00Z"
}
```

**Implementação:** `custom-webhook/index.ts`

**Endpoint:** `POST /custom-webhook?webhook_id=<seu-webhook-id>`

**Headers (opcional):**
```
x-webhook-secret: seu-secret-aqui
```

**Body:** JSON livre

**Configuração prévia necessária:**
1. Inserir registro em `webhook_configs`:
```sql
INSERT INTO webhook_configs (tenant_id, webhook_id, name, description, secret, is_active)
VALUES (
  '<seu-tenant-id>',
  'zapier-integration',
  'Integração Zapier',
  'Recebe leads do Zapier',
  'secret-abc123',
  true
);
```

2. URL final: `https://<project>.supabase.co/functions/v1/custom-webhook?webhook_id=zapier-integration`

**Resolução automática de customer_id:**
- Se payload contém `customer_id` → usa direto
- Se payload contém `email`, `phone` ou `document` → busca customer na base
- Se não encontrar → dispara automação sem customer_id (genérico)

**Exemplo de uso:**
- Integração com CRM externo (HubSpot, RD Station)
- Receber notificações de plataformas de pagamento (Stripe, Asaas)
- Conectar Google Sheets via Zapier/Make
- Disparar automação quando lead fecha negócio no Pipedrive

---

## Arquitetura Backend

### 📁 Estrutura de arquivos

```
apps/crm/supabase/functions/
├── _shared/
│   └── automation-emitters.ts ← Helper centralizado
├── whatsapp-webhook/index.ts ← conversation_created
├── whatsapp-archive-conversation/index.ts ← conversation_archived
├── contact-list-webhook/index.ts ← lead_created
├── yampi-sync/index.ts ← tracking_created, tracking_updated
└── custom-webhook/index.ts ← webhook
```

### 🔄 Fluxo de Execução

1. **Evento ocorre** (rastreio gerado, lead adicionado, etc.)
2. **Emitter é chamado** (`emitTrackingCreated`, `emitLeadCreated`, etc.)
3. **Helper verifica automações ativas:**
   ```sql
   SELECT id FROM campaigns
   WHERE tenant_id = ? AND kind = 'automation'
     AND status = 'running' AND trigger_type = ?
   ```
4. **Insere na fila** (`automation_queue`):
   ```sql
   INSERT INTO automation_queue
   (tenant_id, campaign_id, customer_id, trigger_type, trigger_data, status, current_node_id)
   VALUES (?, ?, ?, ?, ?, 'pending', 'start')
   ```
5. **Processador consome fila** (via `automation-cron` ou outro worker)
6. **Executa nós do flow** (enviar WhatsApp, aguardar tempo, condições, etc.)

---

## Frontend

### ✅ Ativação no Flow Editor

**Arquivo:** `apps/crm/src/components/campaign-flow/FlowSidebar.tsx` (linha 66-73)

**Status:** ATIVO (6/6)
- Grupo renomeado: "Em breve" → **"Logística & CRM"**
- Todos os 6 triggers com `enabled: true`
- Descrições atualizadas para refletir comportamento real

**Interface:**
1. Abrir `/automations` no CRM
2. Criar nova automação
3. Selecionar gatilho no dropdown (agora aparecem os 6 novos)
4. Montar flow (WhatsApp, email, delay, condições, etc.)
5. Ativar automação

---

## Banco de Dados

### 📊 Tabelas adicionadas

**Migration:** `20260514_automation_triggers.sql`

#### `webhook_configs`
```sql
CREATE TABLE webhook_configs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  webhook_id text NOT NULL, -- ID amigável tipo "zapier-leads"
  name text NOT NULL,
  description text,
  secret text, -- validação opcional
  is_active boolean DEFAULT true,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, webhook_id)
);
```

#### `webhook_logs`
```sql
CREATE TABLE webhook_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  webhook_id text NOT NULL,
  customer_id uuid,
  payload jsonb NOT NULL,
  status text DEFAULT 'received', -- received | processed | failed
  error_message text,
  received_at timestamptz DEFAULT now(),
  processed_at timestamptz
);
```

**Índices criados:**
- `webhook_configs`: `tenant_id`, `webhook_id` (ativo)
- `webhook_logs`: `tenant_id`, `webhook_id`, `received_at DESC`, `customer_id`

**RLS:** Habilitado (tenant só vê seus dados, service_role acesso total)

---

## Testes

### 🧪 Validar tracking_created

```bash
# 1. Criar pedido de teste no Yampi sem tracking_code
# 2. Criar automação no CRM com trigger "Rastreio gerado"
# 3. Adicionar tracking_code no pedido via Yampi admin
# 4. Rodar sync manualmente:
curl -X POST https://<project>.supabase.co/functions/v1/yampi-sync \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"phase": "refresh_tracking"}'

# 5. Verificar automation_queue:
SELECT * FROM automation_queue
WHERE trigger_type = 'tracking_created'
ORDER BY created_at DESC LIMIT 5;
```

### 🧪 Validar lead_created

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/contact-list-webhook?list_id=<uuid>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste Lead",
    "email": "teste@example.com",
    "phone": "11999998888"
  }'

# Verificar queue:
SELECT * FROM automation_queue WHERE trigger_type = 'lead_created';
```

### 🧪 Validar conversation_created

```bash
# 1. Criar automação com trigger "Nova conversa WhatsApp"
# 2. Enviar mensagem WhatsApp de número novo via Sandbox Meta
# 3. Webhook receberá e detectará como primeira mensagem
# 4. Verificar logs:
grep "New conversation detected" <supabase-logs>
```

### 🧪 Validar conversation_archived

```bash
curl -X POST https://<project>.supabase.co/functions/v1/whatsapp-archive-conversation \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<uuid>",
    "customer_id": "<uuid>",
    "reason": "resolved"
  }'
```

### 🧪 Validar webhook customizado

```bash
# 1. Criar config:
INSERT INTO webhook_configs (tenant_id, webhook_id, name, secret, is_active)
VALUES ('<uuid>', 'test-hook', 'Webhook Teste', 'secret123', true);

# 2. Enviar payload:
curl -X POST "https://<project>.supabase.co/functions/v1/custom-webhook?webhook_id=test-hook" \
  -H "x-webhook-secret: secret123" \
  -H "Content-Type: application/json" \
  -d '{"email": "cliente@example.com", "evento": "compra-realizada", "valor": 150}'

# 3. Verificar logs:
SELECT * FROM webhook_logs WHERE webhook_id = 'test-hook';
SELECT * FROM automation_queue WHERE trigger_type = 'webhook';
```

---

## Manutenção

### 🗑️ Limpeza de logs

**Retenção:** 90 dias (webhook_logs)

**Cron sugerido:** Diário às 3h
```sql
SELECT cleanup_old_webhook_logs();
```

### 📊 Monitoramento

**Queries úteis:**

```sql
-- Automações ativas por trigger
SELECT trigger_type, COUNT(*) as automations_count
FROM campaigns
WHERE kind = 'automation' AND status = 'running'
GROUP BY trigger_type
ORDER BY automations_count DESC;

-- Eventos disparados nas últimas 24h
SELECT trigger_type, COUNT(*) as events_count
FROM automation_queue
WHERE created_at > now() - interval '24 hours'
GROUP BY trigger_type
ORDER BY events_count DESC;

-- Taxa de sucesso de webhooks
SELECT
  webhook_id,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'processed') as processed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'processed') / COUNT(*), 2) as success_rate
FROM webhook_logs
WHERE received_at > now() - interval '7 days'
GROUP BY webhook_id
ORDER BY total DESC;
```

---

## Roadmap Futuro

**Triggers planejados (não implementados ainda):**
- `tracking_milestone` — marcos específicos (ex: "saiu para entrega")
- `order_review_eligible` — 30 dias após entrega (janela de avaliação)
- `payment_failed_retry` — retry automático de pagamento recusado
- `customer_segment_entered` — quando cliente entra em segmento RFM
- `email_opened` / `email_clicked` — engajamento de email

**Melhorias planejadas:**
- Dashboard de analytics de automações (conversão por trigger)
- A/B test nativo em flows de automação
- Rate limiting por customer (evitar spam)
- Replay de automação falhada com dados originais

---

## Suporte

**Logs:** Supabase Functions logs (tempo real)
**Erros comuns:**
- "No active automations" → Normal se nenhuma automação ativa para o trigger
- "Customer not found" → Payload do webhook precisa conter identificador válido
- "Invalid webhook secret" → Secret no header diferente da config

**Contato:** Astro via Telegram/ClickUp

---

**Implementado por:** Neo (CTO)  
**Data:** 2026-05-14  
**Status:** ✅ Produção  
**Versão:** 1.0.0
