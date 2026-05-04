
# Auditoria Maxfem CRM — WhatsApp & E-mail

## 1. Diagnóstico atual

### Pontos fortes já implementados
- Multi-tenant com RLS isolado
- WhatsApp Cloud API oficial + webhook bidirecional (7.298 msgs)
- E-mail via AWS SES com tracking (open/click/bounce/complaint)
- Builder visual de fluxos (React Flow) + 16 automações prontas
- RFM + LTV + listas dinâmicas
- Encurtador de links proprietário com UTMs
- Atribuição 72h click→pedido
- Bling + Yampi + Pixel próprio
- AI Copilot (GPT-4o-mini) com Vision
- Fila durável (`automation_queue`) com índice único anti-duplicação

### Lacunas identificadas (vs. Klaviyo / Mailchimp / WATI)

**WhatsApp**
- Sem rate-limit / throttling adaptativo (Meta tier MAU 1k/10k/100k)
- Sem detecção de quality rating (GREEN/YELLOW/RED) automática
- Sem opt-out/STOP automático nem Lista de Bloqueio (DNC)
- Sem janela de "horário comercial" por automação
- Sem agendamento por timezone do destinatário
- Sem A/B testing nativo de templates
- Sem reaproveitamento de sessão 24h (free-form quando aberta)
- Sem agrupamento de conversa por agente (assignment)
- Sem SLA / tempo de primeira resposta
- Sem respostas rápidas / shortcuts (/atalhos)
- Sem tags de conversa estruturadas

**E-mail (SES)**
- `email_suppressions` simples (sem motivo detalhado, sem TTL)
- Sem preference center (categorias de opt-in)
- Sem warm-up automático de IP/domínio
- Sem teste de spam (SpamAssassin score, inbox placement)
- Sem preview multi-cliente (Gmail/Outlook/Apple)
- Sem fallback automático WhatsApp→E-mail→SMS
- Sem deduplicação por `message_id` no log
- Sem RFC 8058 List-Unsubscribe-Post (one-click Gmail/Yahoo)
- Sem DMARC report ingestion

**Cross-channel / Plataforma**
- Sem frequency capping (ex: máx. 3 msgs/semana por cliente)
- Sem quiet hours globais (não enviar 22h-8h)
- Sem journey orchestrator unificado (hoje fluxo é por canal)
- Sem predictive analytics (best send time, churn score)
- Sem segmentação preditiva (CLV previsto, propensão de compra)
- Sem webhooks de saída para terceiros
- Sem audit log de ações administrativas
- Sem 2FA nem SSO
- Sem versionamento de templates
- Sem sandbox / modo teste sem cobrar Meta
- Sem health dashboard (latência API, erros por endpoint)

---

## 2. Roadmap de melhorias — 4 ondas

### Onda 1 — Fundamentos de Deliverability (ALTA prioridade)

**1.1 Frequency Capping & Quiet Hours**
- Nova tabela `messaging_policies` por tenant: `max_per_day`, `max_per_week`, `quiet_hours_start/end`, `timezone`
- Hook no `campaign-executor`: verifica antes de cada envio (WhatsApp + e-mail)
- Reagenda automaticamente para fora de quiet hours
- UI em Settings → "Políticas de Envio"

**1.2 Lista de Bloqueio (DNC) unificada**
- Nova tabela `contact_blocklist` (canal: whatsapp/email/all, motivo, origem)
- Detecção automática de STOP/SAIR/PARAR no `whatsapp-webhook` → adiciona à blocklist
- One-click unsubscribe RFC 8058 (header `List-Unsubscribe-Post`) no SES
- Página pública de gerenciamento de preferências por token

**1.3 Quality Rating Monitor (WhatsApp)**
- Cron consulta `GET /{phone_number_id}` a cada 1h
- Persiste `quality_rating`, `messaging_limit_tier`, `name_status` em `whatsapp_accounts`
- Alerta no dashboard quando cair para YELLOW/RED
- Pause-automático de campanhas em massa quando RED

**1.4 Deduplicação de logs + tabela unificada**
- Migrar para padrão `message_id` único correlacionando estados (pending→sent→delivered→read)
- View `v_email_log_latest` com `DISTINCT ON (message_id)`
- Mesmo padrão para `whatsapp_messages`

---

### Onda 2 — Engagement & Conversão

**2.1 A/B Testing nativo**
- Em campanhas: 2-4 variantes (template, horário, copy)
- Split aleatório configurável (ex: 10/10/80)
- Métrica de vitória: open rate, CTR, conversão
- Promoção automática do vencedor após N envios

**2.2 Send Time Optimization (STO)**
- Job analisa histórico de `whatsapp_messages.read_at` e `email_events.opened_at` por cliente
- Calcula melhor janela de envio (hora do dia + dia da semana)
- Coluna `customers.best_send_hour` populada por cron diário
- Opção "Enviar no melhor horário" nas automações

**2.3 Preference Center**
- Página pública `/preferences/:token`
- Cliente escolhe canais (WA/E-mail) e categorias (promoções, transacional, novidades)
- Tabela `customer_preferences` (customer_id, channel, category, opted_in)
- Filtro automático no `campaign-executor`

**2.4 Respostas rápidas no Chat**
- Tabela `quick_replies` (tenant, shortcut, content, category)
- Atalho `/` no `ChatInput` abre menu
- Variáveis dinâmicas: `{{customer.name}}`, `{{order.code}}`

**2.5 Atribuição de conversas + SLA**
- Coluna `assigned_to` em conversation_state (já há custom_attributes — usar ou criar tabela)
- Métricas: tempo de primeira resposta, tempo de resolução
- Fila por agente + balanceamento automático
- Notificações in-app quando SLA estourar

---

### Onda 3 — Inteligência

**3.1 Journey Orchestrator (fluxo cross-channel)**
- Estender `flow_data` JSONB para suportar nó "tente WA, se não entregue em X min, mande e-mail"
- Novo node type `channel_fallback` com cascata configurável
- Estado de execução por cliente em `journey_state`

**3.2 Predictive Scoring**
- Edge function `predictive-scoring` (cron diário)
- Gera 3 scores por cliente: `churn_risk` (0-100), `next_purchase_days`, `clv_predicted`
- Usa Lovable AI (gemini-2.5-flash) com features: RFM, recency, ticket médio, CTR histórico
- Filtros por score em segmentações

**3.3 Spam Score & Inbox Preview**
- Integração com SpamAssassin (via API ou container) antes do envio
- Preview multi-cliente usando MJML render + screenshot (Gmail/Outlook simulados)
- Bloqueio de envio se score > 5

**3.4 DMARC / BIMI**
- Guia em Settings AWS para configurar DMARC + BIMI
- Edge function que faz parse de relatórios DMARC enviados ao tenant
- Dashboard de "saúde do domínio"

---

### Onda 4 — Plataforma & Governança

**4.1 Audit Log**
- Tabela `audit_logs` (user_id, tenant_id, action, entity, entity_id, diff_json, ip, ua)
- Trigger genérico em tabelas críticas (campaigns, message_templates, whatsapp_accounts, integrations)
- UI em Settings → Auditoria com filtros

**4.2 2FA + Roles granulares**
- Habilitar TOTP no Supabase Auth
- Expandir `app_role` para: `owner`, `admin`, `manager`, `agent`, `viewer`
- Permissões por feature em tabela `role_permissions`

**4.3 Webhooks de saída**
- Tabela `outbound_webhooks` (tenant, url, events[], secret, active)
- Eventos: `message.delivered`, `campaign.completed`, `customer.converted`, `chat.assigned`
- Edge function `webhook-dispatcher` com HMAC SHA-256 + retry exponencial

**4.4 Health Dashboard interno**
- Página `/admin/health` (somente owner)
- Métricas: latência média Meta API, taxa de erro SES, fila `automation_queue` backlog, tempo médio de processamento
- Gráficos Recharts em tempo real (Supabase Realtime)

**4.5 Sandbox / Modo Teste**
- Toggle "modo teste" por campanha → envia só para números/e-mails whitelistados
- Não consome conversação Meta, não loga em métricas reais

---

## 3. Resumo executivo (priorizado)

| # | Item | Onda | Esforço | Impacto |
|---|------|------|---------|---------|
| 1 | Frequency Capping + Quiet Hours | 1 | M | Alto (proteção quality rating) |
| 2 | DNC unificada + STOP automático + RFC 8058 | 1 | M | Alto (compliance) |
| 3 | Quality Rating Monitor | 1 | S | Alto (evita ban Meta) |
| 4 | Deduplicação de logs | 1 | S | Médio (analytics corretos) |
| 5 | A/B Testing | 2 | L | Alto (otimização) |
| 6 | Send Time Optimization | 2 | M | Médio |
| 7 | Preference Center | 2 | M | Alto (LGPD) |
| 8 | Quick Replies + SLA chat | 2 | M | Alto (operação) |
| 9 | Journey cross-channel | 3 | L | Alto |
| 10 | Predictive scoring (IA) | 3 | M | Alto (diferencial) |
| 11 | Spam preview | 3 | L | Médio |
| 12 | Audit Log + 2FA + Roles | 4 | M | Alto (enterprise) |
| 13 | Webhooks saída | 4 | M | Médio |
| 14 | Health dashboard | 4 | S | Médio |
| 15 | Sandbox de testes | 4 | S | Médio |

---

## 4. Próximo passo recomendado

Sugiro começar pela **Onda 1 inteira** (itens 1-4) — são fundações que protegem a conta Meta de ban, garantem conformidade LGPD/CAN-SPAM, e corrigem analytics. Esforço estimado: 1-2 sprints.

Se aprovar, implementarei na seguinte ordem:
1. Migração SQL (tabelas `messaging_policies`, `contact_blocklist`, view dedup)
2. Hooks no `campaign-executor` e `whatsapp-webhook`
3. Cron de quality rating
4. UIs em Settings (Políticas, Blocklist) + badge no Dashboard
5. Preference center público

**Posso seguir com a Onda 1, ou prefere começar por outra prioridade / cherry-pick itens específicos?**
