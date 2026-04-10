

## Agendamento e envio automático de campanhas por WhatsApp

### Objetivo
Adicionar campos de data e horário de envio na campanha, e criar um job automático que dispara as mensagens via WhatsApp no momento programado.

### Arquitetura

```text
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  FlowSidebar    │────▶│  campaigns   │────▶│  pg_cron (1min)  │
│  (data + hora)  │     │  scheduled_at│     │  chama edge fn   │
└─────────────────┘     │  status      │     └────────┬─────────┘
                        └──────────────┘              │
                                                      ▼
                                              ┌──────────────────┐
                                              │ campaign-executor│
                                              │  (edge function) │
                                              │  - busca lista   │
                                              │  - busca template│
                                              │  - envia WhatsApp│
                                              └──────────────────┘
```

### 1. Migração: coluna `scheduled_at` na tabela `campaigns`

Adicionar coluna `scheduled_at TIMESTAMPTZ` para armazenar data/hora de envio. A coluna `start_date` já existe mas não está sendo usada — vamos usar `scheduled_at` para clareza.

### 2. UI: campos de data e hora no FlowSidebar

No `FlowSidebar.tsx`, adicionar abaixo do campo "Lista":
- **Data de envio**: input tipo `date`
- **Horário de envio**: input tipo `time`

Ao salvar a campanha (`handleSave` no `CampaignFlowEditor.tsx`), persistir o valor combinado em `scheduled_at` e setar status como `scheduled` quando uma data futura for definida.

### 3. Edge Function: `campaign-executor`

Nova edge function que:
1. Busca campanhas com `status = 'scheduled'` e `scheduled_at <= now()`
2. Para cada campanha:
   - Busca a lista de contatos associada (ou todos os customers do tenant)
   - Identifica o template WhatsApp do primeiro nó `sendWhatsApp` no `flow_data`
   - Busca o `phone_number_id` e token do tenant via `whatsapp_accounts`
   - Envia mensagem para cada contato via Graph API
   - Registra em `campaign_activities` e `whatsapp_messages`
   - Atualiza status da campanha para `sent`

### 4. Cron job: disparar a cada minuto

Usar `pg_cron` + `pg_net` para chamar `campaign-executor` a cada minuto via HTTP POST. O executor só processa campanhas cujo `scheduled_at` já passou.

### 5. Atualizar `CampaignFlowEditor.tsx`

- Passar `scheduledAt` e `onScheduledAtChange` para o `FlowSidebar`
- Carregar `scheduled_at` do banco ao abrir a campanha
- Salvar `scheduled_at` junto com os outros campos

### 6. Feedback visual

- Na lista de campanhas (`Campaigns.tsx`), mostrar a data/hora agendada no card quando status = `scheduled`
- Badge "Agendado" já existe no `statusConfig`

### Detalhes técnicos

- **Fuso horário**: salvar em UTC, exibir no horário local do navegador
- **Proteção contra duplicidade**: o executor marca a campanha como `sending` antes de processar, evitando execuções paralelas pelo cron
- **Rate limiting**: enviar com delay de 100ms entre mensagens para respeitar limites da Meta
- **Fallback de lista**: se nenhuma lista for selecionada, enviar para todos os customers do tenant que tenham phone

