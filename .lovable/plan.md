## Diagnóstico atual

Verifiquei o estado real do sistema (banco + edge functions + tela):

**O que está funcionando**
- `send-email-ses` envia para o SES e o SES aceita (`MessageId` retornado).
- 30 e-mails da campanha "Dia das mães - v1 (cópia)" foram registrados em `email_logs` com `status='sent'` e `aws_message_id` válido.
- O backfill de ontem corrigiu `campaign_activities` — por isso o "Log de Atividades" agora aparece com 30 enviados.

**O que está quebrado (causa de "Entregues/Lidos/Cliques = 0")**

1. A tabela `email_events` tem **apenas 1 evento `Delivery` em 7 dias**, mesmo com 30+ envios. Ou seja, o SES está enviando, mas os eventos pós-envio (Delivery, Open, Click, Bounce, Complaint) **não estão chegando** na função `ses-events-webhook`.
2. Como consequência:
   - `email_logs.status` fica eternamente em `sent` (nunca vira `delivered`).
   - `email_logs.opens` / `clicks` ficam em `0`.
   - `campaign_activities.delivered_at` / `read_at` / `clicked_at` ficam `NULL` → KPIs da campanha exibem 0.
3. Causas prováveis (a confirmar na conta AWS):
   - O **Configuration Set** usado no envio não tem um **Event Destination SNS** apontando pro tópico que dispara nosso webhook; **ou**
   - O tópico SNS não tem assinatura HTTPS confirmada apontando para `…/functions/v1/ses-events-webhook`; **ou**
   - O envio não está passando `ConfigurationSetName` (no banco, `email_logs.configuration_set` está vindo `null` — preciso confirmar) — sem isso o SES não publica eventos.
   - O **engagement tracking (Open/Click)** do Configuration Set está desligado, então o SES nem injeta o pixel/redirect.

**Gaps secundários encontrados**
- `ses-events-webhook` atualiza `email_logs` por `aws_message_id`, mas **não está deduplicando** eventos repetidos de Open (incrementa `opens` toda vez que abre — ok), porém **não atualiza `last_event_at` em todos os caminhos** (ex.: Delivery atualiza, mas Open passa por um segundo update que sobrescreve).
- A tela de detalhes da campanha lê `campaign_activities` direto, mas o "Funil de Entrega" parece somar só `sent` quando os outros campos estão NULL — precisa exibir 0 explicitamente em vez de barra vazia.
- Não há tela administrativa para ver eventos brutos (`email_events`) — dificulta debug pelo usuário.
- Não há reprocessamento em lote: se o webhook ficou fora do ar, eventos antigos do SES são perdidos (SES não reentrega depois de muitas tentativas).

---

## Plano de correção (ponta a ponta)

### Etapa 1 — Diagnóstico AWS (confirmar antes de codar)
1. Listar via `ses-identities` / chamada SES o **Configuration Set** que está sendo usado e seus Event Destinations.
2. Verificar se há um destino SNS publicando os tipos: `Send`, `Delivery`, `Open`, `Click`, `Bounce`, `Complaint`, `Reject`.
3. Verificar se o tópico SNS tem subscrição HTTPS para `https://poukhwsbskcvwroeqoct.functions.supabase.co/ses-events-webhook` em status **Confirmed**.
4. Verificar se "Open and Click tracking" está habilitado no Configuration Set.

Se algum item faltar, executar o passo 2; senão, pular para 3.

### Etapa 2 — Provisionamento automático SES → SNS → Webhook
- Adicionar uma função `ses-setup-tracking` que, dado o tenant/configuration set, cria/garante:
  - O Configuration Set com tracking de open/click ativado.
  - Um tópico SNS dedicado (`maxfem-ses-events-{tenant}`).
  - Um Event Destination apontando para o tópico, com todos os tipos de evento.
  - Subscrição HTTPS para `ses-events-webhook` (a confirmação automática já está implementada no webhook — confirmei).
- Disparar essa função na tela `Settings → AWS` com um botão "Verificar/Reparar rastreamento".

### Etapa 3 — Garantir que todo envio use o Configuration Set
- No `send-email-ses`: quando `configurationSet` não vier no payload, **buscar de `integrations.config.configuration_set`** do tenant antes de cair no `null`.
- No `campaign-executor` (linhas 453, 868): mesma lógica — se a campanha não trouxer, pegar do tenant.
- Migration: adicionar coluna `configuration_set` em `integrations.config` se ainda não existir e preencher para o tenant Maxfem.

### Etapa 4 — Robustez do webhook (`ses-events-webhook`)
- Atualizar `last_event_at` em todos os ramos (Open/Click/Bounce/Complaint), não só em Delivery.
- Tornar o upsert em `campaign_activities` idempotente quando o `Delivery` chega antes do `Send` (raro, mas acontece).
- Logar `tenant_id` e `aws_message_id` em todos os erros pra rastreamento.
- Retornar 200 sempre que o payload for SNS válido (já está, mas adicionar verificação de assinatura SNS opcional para segurança futura).

### Etapa 5 — Reprocessamento e visibilidade
- Nova página `Settings → E-mail → Diagnóstico` (admin) com:
  - Status do Configuration Set (lendo via SES API).
  - Status da subscrição SNS.
  - Últimos 50 eventos de `email_events` (já temos a tabela).
  - Botão "Reprocessar últimos N envios": consulta SES `GetMessageInsights` (quando disponível) ou simplesmente reconcilia `email_logs.status` baseado em `email_events`.
- Função `email-reconcile`: roda a cada 15 min via cron, varre `email_logs` com `status='sent'` há mais de 1h e tenta cruzar com `email_events` pra atualizar `delivered/opened/clicked`.

### Etapa 6 — Telas de visualização (frontend)
- **Detalhes da campanha** (`CampaignDetails.tsx`):
  - KPIs já existem; corrigir cálculo: `entregues = activities.filter(a => a.delivered_at).length`, idem para read/click. Hoje provavelmente está zerado por leitura errada.
  - Funil: mostrar barras com 0 explícito quando não houver dados, e tooltip "aguardando eventos do provedor".
  - Adicionar coluna **"Última atualização"** na tabela de atividades, lendo `last_event_at`.
- **Atividades** (`Activities.tsx`):
  - Adicionar filtro por status real (sent/delivered/opened/clicked/bounced) usando `campaign_activities`.
  - Mostrar ícone diferente quando `delivered_at` existe.
- **Indicadores** (`Dashboard.tsx`):
  - Cards de "Entregue", "Aberto", "Clicado" devem somar de `email_logs.opens > 0` e `clicks > 0` em vez de só `status`.

### Etapa 7 — Teste fim a fim
1. Disparar campanha de teste para 2 e-mails reais (1 inbox + 1 que vai bounce).
2. Aguardar ~30s → verificar `email_events` recebendo `Delivery`.
3. Abrir o e-mail no inbox → verificar `Open` em `email_events` e `email_logs.opens=1`.
4. Clicar num link → verificar `Click` e `clicks=1`.
5. Conferir que `CampaignDetails` mostra os 4 estágios do funil populados.

---

## Resumo do que vai mudar

| Camada | Arquivo | Mudança |
|---|---|---|
| Backend | `supabase/functions/send-email-ses/index.ts` | Fallback para configuration set do tenant |
| Backend | `supabase/functions/campaign-executor/index.ts` | Idem |
| Backend | `supabase/functions/ses-events-webhook/index.ts` | last_event_at em todos os ramos, logs melhores |
| Backend (novo) | `supabase/functions/ses-setup-tracking/index.ts` | Provisiona CS + SNS + subscrição |
| Backend (novo) | `supabase/functions/email-reconcile/index.ts` | Cron 15min reconciliando logs com eventos |
| DB | migration | índice em `email_events(message_id)`, garantia de coluna `configuration_set` no integrations |
| Frontend | `SettingsAWS.tsx` | Botão "Verificar/Reparar rastreamento" + status |
| Frontend | `CampaignDetails.tsx` | KPIs corrigidos, coluna "última atualização", funil tolerante a 0 |
| Frontend | `Activities.tsx` | Filtros por status real |
| Frontend (novo) | `SettingsEmailDiagnostics.tsx` | Página de diagnóstico e eventos brutos |

**Resultado esperado:** ao agendar uma campanha de e-mail, ela dispara no horário, os 4 estágios do funil (Enviado → Entregue → Lido → Clicado) se preenchem em tempo quase real, e as mesmas métricas aparecem consistentes em Dashboard, Atividades e Detalhes da Campanha.