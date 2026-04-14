

## Plan: Migrar Links para `wpp.maxapps.com.br` + Dashboard de Tracking

### Contexto
O domínio `wpp.maxapps.com.br` já está configurado e apontando para o projeto via Lovable. Atualmente os links usam a URL do backend (`${SUPABASE_URL}/functions/v1/link-redirect?c=CODE`). Precisamos migrar para `https://wpp.maxapps.com.br/r/CODE` e adicionar um dashboard de cliques/conversões.

### Parte 1: Migrar URL dos Links

**Problema**: O `linkShortener.ts` gera URLs com a URL interna do backend. Precisamos trocar para o domínio personalizado.

**Arquivos a alterar:**

| Arquivo | Mudança |
|---------|---------|
| `src/lib/linkShortener.ts` | Trocar `${supabaseUrl}/functions/v1/link-redirect?c=${code}` por `https://wpp.maxapps.com.br/r/${code}` |
| `supabase/functions/link-redirect/index.ts` | Adicionar suporte ao path `/r/:code` além do query param `?c=` (para o novo formato de URL) |
| `mem://features/tracking/link-shortener-utm` | Atualizar domínio de referência |

**Nota sobre o `campaign-executor`**: Ele passa apenas o `code` para o template Meta como `{{1}}`. O domínio base é configurado no template da Meta (ex: `https://wpp.maxapps.com.br/r/{{1}}`). Portanto **não precisa alterar** o campaign-executor — apenas garantir que os templates na Meta usem a URL base correta.

### Parte 2: Dashboard de Cliques e Conversões

Adicionar uma seção de tracking na página Dashboard (`/dashboard`) com:

**KPIs adicionais (na grid existente):**
- CTR (Cliques / Entregas)
- Conversões (total de `converted_at` preenchidos)
- Receita Atribuída (soma de `conversion_value`)

**Novo gráfico:**
- Cliques por dia (BarChart, últimos 14 dias) — cruzando `tracked_links` + `link_clicks`
- Tabela rankeada: Top campanhas/automações por cliques e conversões

**Dados**: Usar as queries existentes de `activities` e `clicks` já presentes no Dashboard, expandindo para incluir conversões e agrupamento por campanha.

### Resultado
- Links curtos com domínio próprio: `https://wpp.maxapps.com.br/r/CODE`
- Dashboard com visibilidade de cliques, CTR, conversões e receita atribuída por campanha

