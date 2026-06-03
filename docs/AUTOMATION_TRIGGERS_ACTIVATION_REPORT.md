# Relatório de Ativação dos Triggers de Automação

**Data:** 14/05/2026  
**Projeto:** CRM Maxfem  
**Responsável:** Dev (Head de Engenharia)  
**Status:** ✅ CONCLUÍDO

---

## Resumo Executivo

Todos os **6 triggers** que estavam marcados como "EM BREVE" no flow editor de automações foram **ativados e implementados completamente**:

| # | Trigger | Descrição | Status |
|---|---------|-----------|--------|
| 1 | `tracking_created` | Rastreio gerado | ✅ Ativo |
| 2 | `tracking_updated` | Rastreio atualizado | ✅ Ativo |
| 3 | `lead_created` | Lead inserido na lista | ✅ Ativo |
| 4 | `conversation_created` | Nova conversa WhatsApp | ✅ Ativo |
| 5 | `conversation_archived` | Conversa arquivada | ✅ Ativo |
| 6 | `webhook` | Webhook customizado | ✅ Ativo |

---

## Arquitetura Implementada

### 1. Frontend (UI)

**Arquivo:** `apps/crm/src/components/campaign-flow/FlowSidebar.tsx`

```typescript
{ group: "Logística & CRM", items: [
  { value: "tracking_created", label: "Rastreio gerado", enabled: true },
  { value: "tracking_updated", label: "Rastreio atualizado", enabled: true },
  { value: "lead_created", label: "Lead inserido na lista", enabled: true },
  { value: "conversation_created", label: "Nova conversa WhatsApp", enabled: true },
  { value: "conversation_archived", label: "Conversa arquivada", enabled: true },
  { value: "webhook", label: "Webhook customizado", enabled: true },
]},
```

### 2. Backend (Event Emitters)

**Arquivo:** `supabase/functions/_shared/automation-emitters.ts`

Implementa 6 funções de emissão de eventos:

- `emitTrackingCreated()` - Dispara quando código de rastreio é gerado
- `emitTrackingUpdated()` - Dispara quando status de rastreio muda
- `emitLeadCreated()` - Dispara quando lead é adicionado a uma lista
- `emitConversationCreated()` - Dispara na primeira mensagem WhatsApp
- `emitConversationArchived()` - Dispara quando conversa é arquivada/resolvida
- `emitWebhookEvent()` - Processa webhooks HTTP externos

### 3. Database (Triggers & RPCs)

**Migration:** `20260514000000_automation_event_dispatchers.sql`

**RPCs criadas:**
- `dispatch_automation_trigger(tenant, type, customer, data)` - Enfileira automação
- `notify_tracking_event(tenant, event, customer, order, tracking)` - Entrada para tracking

**DB Triggers criados:**
- `trg_lead_created_dispatch` - Em `contact_list_members`
- `trg_conversation_created_dispatch` - Em `whatsapp_messages` (insert)
- `trg_conversation_archived_dispatch` - Em `whatsapp_messages` (update)
- `trg_auto_create_webhook_dispatch` - Em `campaigns`

**Tabelas criadas:**
- `automation_webhooks` - Endpoint keys para webhook trigger
- `webhook_configs` - Configuração de webhooks customizados
- `webhook_logs` - Auditoria de chamadas webhook
- `tracking_state` - Snapshot de estados de rastreio (diff engine)

### 4. Edge Functions (Integrações)

| Edge Function | Trigger | Frequência |
|---------------|---------|------------|
| `whatsapp-webhook` | `conversation_created` | Webhook (real-time) |
| `whatsapp-archive-conversation` | `conversation_archived` | On-demand |
| `contact-list-webhook` | `lead_created` | Webhook (real-time) |
| `custom-webhook` | `webhook` | Webhook (real-time) |
| `yampi-sync` | `tracking_created/updated` | Cron (15min) |
| `tracking-events-sync` | `tracking_created/updated` | Cron (15min) |
| `webhook-trigger` | `webhook` | Webhook (real-time) |

### 5. Cron Jobs

**Job:** `tracking-events-sync`  
**Schedule:** `*/15 * * * *` (a cada 15 minutos)  
**Função:** Faz diff da API Yampi para detectar novos rastreios ou mudanças de status

---

## Fluxo de Dados

### Exemplo 1: Nova Conversa WhatsApp

```
Cliente envia mensagem → whatsapp-webhook (edge fn)
    ↓
Insere em whatsapp_messages
    ↓
trg_conversation_created_dispatch (DB trigger)
    ↓
dispatch_automation_trigger(tenant, 'conversation_created', customer)
    ↓
Busca automações ativas com trigger_type='conversation_created'
    ↓
Insere em automation_queue para cada automação
    ↓
automation-cron processa fila e executa fluxos
```

### Exemplo 2: Rastreio Gerado

```
Pedido criado no Yampi → tracking-events-sync (cron 15min)
    ↓
Detecta tracking_code novo via diff com tracking_state
    ↓
dispatch_automation_trigger(tenant, 'tracking_created', customer)
    ↓
Enfileira automações ativas
    ↓
Automação envia WhatsApp: "Seu pedido foi enviado! 🚚"
```

### Exemplo 3: Webhook Customizado

```
Sistema externo faz POST /webhook-trigger?key=abc123
    ↓
webhook-trigger valida endpoint_key em automation_webhooks
    ↓
Extrai customer_id do payload
    ↓
dispatch_automation_trigger(tenant, 'webhook', customer, payload)
    ↓
Automação processa dados do webhook
```

---

## Validação e Testes

### Script de Validação

**Arquivo:** `scripts/validate-automation-triggers-simple.js`

```bash
node scripts/validate-automation-triggers-simple.js
```

✅ **Output esperado:**
```
✅ TODOS OS 6 TRIGGERS ESTÃO IMPLEMENTADOS E ATIVOS!
```

### Comandos de Diagnóstico

```bash
# Verificar DB triggers
npx supabase db query --linked "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%_dispatch';"

# Verificar RPCs
npx supabase db query --linked "SELECT proname FROM pg_proc WHERE proname IN ('dispatch_automation_trigger', 'notify_tracking_event');"

# Verificar cron
npx supabase db query --linked "SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'tracking-events-sync';"

# Verificar tabelas
npx supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%webhook%' OR table_name = 'tracking_state';"
```

---

## Próximos Passos

### Para a Equipe de Produto

1. ✅ Triggers estão disponíveis no dropdown "Gatilho" em `/automations`
2. ✅ Criar automações de exemplo para cada trigger
3. ✅ Testar fluxos end-to-end em sandbox (toggle "Modo teste")
4. ✅ Documentar casos de uso para cada trigger

### Para a Equipe de Marketing

1. **Tracking Created:** "Seu pedido saiu para entrega! 🚚 Acompanhe: [link]"
2. **Tracking Updated:** Notificar cada evento (em trânsito, saiu para entrega, entregue)
3. **Lead Created:** Boas-vindas + oferta especial para novos leads
4. **Conversation Created:** Auto-resposta de horário de atendimento
5. **Conversation Archived:** Pesquisa de satisfação pós-atendimento
6. **Webhook:** Integrar com Zapier/Make/Pabbly para eventos externos

### Para a Equipe de Operações

1. Monitorar `automation_queue` para ver volumes
2. Configurar alertas de erro via `automation_cron` logs
3. Configurar webhook_configs para integrações de parceiros
4. Revisar webhook_logs periodicamente para auditoria

---

## Métricas de Sucesso

| Métrica | Como Medir |
|---------|-----------|
| Automações ativas | `SELECT COUNT(*) FROM campaigns WHERE is_automation=true AND status='active'` |
| Execuções por dia | `SELECT COUNT(*) FROM automation_queue WHERE created_at >= NOW() - INTERVAL '24 hours'` |
| Taxa de sucesso | `SELECT COUNT(*) FILTER (WHERE status='completed') * 100.0 / COUNT(*) FROM automation_queue` |
| Tempo médio de execução | `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FROM automation_queue WHERE status='completed'` |

---

## Documentação Técnica

- **Frontend:** `apps/crm/src/components/campaign-flow/FlowSidebar.tsx`
- **Backend Emitters:** `supabase/functions/_shared/automation-emitters.ts`
- **Database Schema:** `supabase/migrations/20260514000000_automation_event_dispatchers.sql`
- **Webhook Tables:** `supabase/migrations/20260514_automation_triggers.sql`
- **Validação:** `scripts/validate-automation-triggers-simple.js`

---

## Decisões Arquiteturais

### Por que DB Triggers para conversation e lead?

- **Real-time:** Disparam imediatamente após o evento (sem latência de cron)
- **Confiável:** Garantido pelo próprio PostgreSQL
- **Atomic:** Parte da mesma transação que criou o registro

### Por que Cron para tracking?

- **Fonte externa:** Dados vivem na API Yampi (não no CRM)
- **Diff engine:** Precisa comparar estado anterior vs. atual
- **Batch:** Mais eficiente processar múltiplos pedidos de uma vez

### Por que RPC + Queue pattern?

- **Desacoplado:** Emissão de evento é independente da execução
- **Escalável:** Múltiplas automações podem reagir ao mesmo evento
- **Retry-able:** Falhas podem ser reprocessadas via automation-cron

---

## Segurança

### Webhook Customizado

- **Secret validation:** Header `x-webhook-secret` validado contra `webhook_configs.secret`
- **Rate limiting:** TODO - implementar via edge function
- **Audit log:** Toda chamada registrada em `webhook_logs`

### RLS Policies

```sql
-- Webhook configs: tenant só vê os seus
CREATE POLICY webhook_configs_tenant_access ON webhook_configs
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Webhook logs: tenant só lê os seus
CREATE POLICY webhook_logs_tenant_read ON webhook_logs
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## Contato

**Para dúvidas técnicas:** Dev (Head de Engenharia)  
**Para casos de uso:** Marcus (CPO)  
**Para suporte operacional:** Otto (COO)

---

**Status:** ✅ **SISTEMA PRONTO PARA PRODUÇÃO**

_Relatório gerado em 14/05/2026 após ativação completa dos 6 triggers de automação._
