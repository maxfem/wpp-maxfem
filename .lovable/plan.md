

# Análise Completa da Plataforma Maxfem CRM

## 1. PERFORMANCE

### 1.1 Chat: Polling sem Realtime (Impacto ALTO)
O chat (`src/pages/Chat.tsx:45`) usa `refetchInterval: 5000` para buscar **todas** as mensagens do tenant a cada 5 segundos. Isso gera carga desnecessária no banco e latência perceptível.
- **Correção**: Substituir polling por Supabase Realtime (`postgres_changes`) na tabela `whatsapp_messages`. Manter apenas um fallback de 30s.

### 1.2 Chat carrega TODOS os clientes sem paginação (Impacto ALTO)
`src/pages/Chat.tsx:49-60` faz `select("*")` em `customers` sem `.limit()`. Com milhares de clientes, isso degrada a performance.
- **Correção**: Carregar apenas clientes que têm conversas ativas, usando um join ou lookup sob demanda.

### 1.3 Automations: carrega TODAS as activities sem limite (Impacto MÉDIO)
`src/pages/Automations.tsx:88-99` busca todas as `campaign_activities` do tenant sem paginação. À medida que o volume cresce, isso vai travar a página.
- **Correção**: Agregar métricas via query SQL (GROUP BY campaign_id com SUM/COUNT) em vez de trazer todos os registros para o client-side.

### 1.4 Automation Queue Counts: busca rows individuais (Impacto MÉDIO)
`src/pages/Automations.tsx:101-119` puxa cada row `pending` só para contar no client. Deveria usar `{ count: "exact", head: true }` agrupado, ou uma query SQL com GROUP BY.
- **Correção**: Usar `select("campaign_id", { count: "exact", head: true })` ou uma RPC dedicada.

### 1.5 campaign-executor processa apenas 50 items por ciclo (Impacto BAIXO)
O cron roda a cada ~20s com `limit(50)`. Em picos de fila, o backlog pode crescer.
- **Correção**: Aumentar para 100-200 e/ou processar em paralelo por campaign.

---

## 2. BUGS

### 2.1 RLS impede UPDATE na automation_queue pelo client (Impacto ALTO)
A tabela `automation_queue` não tem policy de UPDATE para `public/authenticated`. O botão "Limpar fila" (`AutomationDetails.tsx:67-74`) faz `.update({ status: 'skipped' })` mas vai falhar silenciosamente com RLS.
- **Correção**: Adicionar RLS policy de UPDATE para membros do tenant.

### 2.2 Busca client-side de clientes ignora paginação server-side
`src/pages/Customers.tsx:144-149` filtra `filtered = customers.filter(...)` mas `customers` já é paginado (50 por página). A busca só funciona dentro da página atual.
- **Correção**: Implementar busca server-side via `.ilike("name", `%${search}%`)`.

### 2.3 Duplicar automação não funciona (botão sem handler)
`src/pages/Automations.tsx:359` tem `<DropdownMenuItem>Duplicar</DropdownMenuItem>` sem `onClick`.
- **Correção**: Implementar lógica de duplicação similar à de templates.

### 2.4 metricsData pode ultrapassar limite de 1000 rows do Supabase
`AutomationDetails.tsx:101-112` faz `select(...)` sem `.limit()`. O default do Supabase é 1000 rows, métricas acima disso serão truncadas sem aviso.
- **Correção**: Paginação ou agregação server-side via RPC.

---

## 3. SEGURANÇA

### 3.1 Storage bucket `whatsapp-media` permite listagem pública (Impacto ALTO)
O linter detectou que o bucket público permite que qualquer pessoa liste todos os arquivos. Um atacante pode enumerar mídias de todos os tenants.
- **Correção**: Restringir a policy de SELECT no bucket para exigir autenticação ou path scoping por tenant.

### 3.2 Sem validação de input no formulário de clientes
`src/pages/Customers.tsx:124-142` insere dados diretamente sem validação (nome, email, telefone). Não há sanitização nem limites de comprimento.
- **Correção**: Adicionar validação Zod client-side e limites de tamanho.

### 3.3 Edge Functions usam token global compartilhado
`whatsapp-webhook`, `campaign-executor`, `whatsapp-send` usam um único `WHATSAPP_ACCESS_TOKEN` global. Em cenário multi-tenant, todos os tenants compartilham o mesmo token Meta.
- **Correção**: Armazenar tokens por tenant na tabela `whatsapp_accounts` ou `integrations`.

### 3.4 Webhook sem verificação de assinatura Meta
`whatsapp-webhook/index.ts` não valida o `X-Hub-Signature-256` header. Qualquer pessoa que conheça a URL pode enviar payloads falsos.
- **Correção**: Implementar verificação HMAC-SHA256 com o App Secret.

### 3.5 Auth: signup sem confirmação de email
`Auth.tsx:36-47` faz signup e redireciona imediatamente para `/dashboard`. Sem `emailRedirectTo` funcional + confirmação, contas falsas podem ser criadas.
- **Correção**: Verificar se auto-confirm está desativado e mostrar tela de "verifique seu email".

---

## 4. MELHORIAS DE ARQUITETURA

### 4.1 Webhook monolítico (804 linhas)
`whatsapp-webhook/index.ts` tem 804 linhas com lookup de pedidos, Bling API, AI copilot, e processamento de mensagens tudo em um arquivo. Dificulta manutenção e debugging.
- **Melhoria**: Extrair para funções modulares (separar webhook handler, AI copilot, e lookups).

### 4.2 campaign-executor monolítico (1047 linhas)
Mesmo problema — graph walker, variable resolution, template building, tudo em um arquivo.
- **Melhoria**: Separar em módulos lógicos dentro do mesmo arquivo (já que Edge Functions exigem index.ts único, mas pode usar imports internos).

### 4.3 Falta de índices no banco
Tabelas como `automation_queue`, `campaign_activities`, `whatsapp_messages` são consultadas frequentemente com filtros em `tenant_id + status`, `campaign_id`, `phone`. Sem índices explícitos, queries vão degradar com volume.
- **Melhoria**: Criar índices compostos: `(tenant_id, status)` em automation_queue, `(campaign_id)` em campaign_activities, `(tenant_id, phone)` em whatsapp_messages.

### 4.4 Sem error boundaries no React
Nenhum `ErrorBoundary` global. Um erro em qualquer componente derruba toda a aplicação.
- **Melhoria**: Adicionar ErrorBoundary global e por rota.

### 4.5 Sem rate limiting nas Edge Functions
Nenhuma edge function implementa rate limiting. Um atacante pode fazer milhares de requests.
- **Melhoria**: Implementar rate limiting básico via contagem em memória ou via banco.

---

## PRIORIZAÇÃO (Matriz Impacto × Esforço)

| Prioridade | Item | Tipo | Esforço |
|---|---|---|---|
| 🔴 P0 | 3.1 Bucket público listável | Segurança | Baixo |
| 🔴 P0 | 2.1 RLS faltando UPDATE na queue | Bug | Baixo |
| 🔴 P0 | 3.4 Webhook sem verificação HMAC | Segurança | Médio |
| 🟡 P1 | 1.1 Chat polling → Realtime | Performance | Médio |
| 🟡 P1 | 1.2 Clientes sem paginação no chat | Performance | Baixo |
| 🟡 P1 | 1.3 Activities sem agregação | Performance | Médio |
| 🟡 P1 | 2.2 Busca client-side em Customers | Bug | Baixo |
| 🟡 P1 | 4.3 Índices no banco | Performance | Baixo |
| 🟢 P2 | 2.3 Duplicar automação sem handler | Bug | Baixo |
| 🟢 P2 | 2.4 Limite 1000 rows em métricas | Bug | Médio |
| 🟢 P2 | 3.2 Validação de inputs | Segurança | Baixo |
| 🟢 P2 | 4.4 Error boundaries | Melhoria | Baixo |
| 🟢 P2 | 3.3 Token global compartilhado | Segurança | Alto |
| 🟢 P3 | 4.1/4.2 Refatorar monolitos | Melhoria | Alto |
| 🟢 P3 | 4.5 Rate limiting | Segurança | Médio |

---

## Próximos Passos

Posso começar implementando os itens P0 (correções críticas de segurança e bugs) em sequência. Deseja que eu prossiga com algum grupo específico?

