

## Link Encurtado com UTM + Tracking de Indicadores

### Por que funciona

A Meta só reporta `sent`, `delivered` e `read`. Não existe dado de **clique** nativo no WhatsApp. Com um encurtador próprio, cada URL nos templates passa pelo seu servidor — registrando **quem clicou, de qual campanha, quando** — antes de redirecionar ao destino final. Combinado com UTMs, a plataforma de e-commerce (GA4, Nuvemshop, etc.) também atribui a venda ao canal correto.

### Arquitetura

```text
Template WhatsApp           Edge Function             Destino
┌──────────────┐     ┌──────────────────────┐     ┌──────────┐
│ "Compre aqui │────▶│ /r/:code             │────▶│ loja.com │
│  mtz.li/abc" │     │ registra clique em   │     │ ?utm_source=whatsapp
│              │     │ tracked_links +      │     │ &utm_campaign=...
│              │     │ campaign_activities   │     │ &utm_medium=...
└──────────────┘     └──────────────────────┘     └──────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ Dashboard KPIs   │
                     │ (cliques reais)  │
                     └──────────────────┘
```

### Etapas

**1. Tabela `tracked_links`**
- Colunas: `id`, `tenant_id`, `code` (slug único, ex: "abc123"), `original_url`, `campaign_id`, `customer_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `created_at`
- RLS por tenant

**2. Tabela `link_clicks`**
- Colunas: `id`, `link_id`, `clicked_at`, `ip`, `user_agent`, `referer`
- Sem RLS (escrita via service role na edge function), leitura por tenant via JOIN

**3. Adicionar colunas de tracking em `campaign_activities`**
- `clicked_at`, `converted_at`, `conversion_value` (numeric)
- Preenchidas automaticamente quando um clique é registrado

**4. Edge Function `link-redirect`**
- Rota pública (sem JWT): recebe `GET /link-redirect?c=abc123`
- Busca o link pelo `code`, registra o clique em `link_clicks`
- Atualiza `campaign_activities.clicked_at` para o par (campaign_id + customer_id)
- Retorna HTTP 302 redirect para `original_url` com UTMs anexados

**5. Helper de geração de links**
- Função utilitária no frontend que, ao montar o payload de envio de template, substitui URLs no body por links encurtados
- Gera o `code` aleatório, insere em `tracked_links` e retorna a URL curta (ex: `https://{SUPABASE_URL}/functions/v1/link-redirect?c=abc123`)

**6. Dashboard dinâmico**
- Substituir dados hardcoded em `Dashboard.tsx` por queries reais:
  - **Receita Total**: `SUM(orders.total)` no período
  - **Receita Martz**: `SUM(conversion_value)` de `campaign_activities` com atribuição
  - **Cliques**: `COUNT(link_clicks)` agrupado por campanha
  - **Taxa de clique**: cliques / entregas (do WhatsApp webhook `delivered`)
  - **Gráficos por dia**: agrupamento temporal das tabelas `orders` e `link_clicks`
- KPIs de cliente (LTV, Ticket Médio, Freq. Compra) calculados da tabela `customers`

### Arquivos alterados

| Arquivo | Ação |
|---------|------|
| Migração SQL | Criar `tracked_links`, `link_clicks`, adicionar colunas em `campaign_activities` |
| `supabase/functions/link-redirect/index.ts` | Nova edge function de redirect + tracking |
| `src/lib/linkShortener.ts` | Helper para gerar links encurtados com UTM |
| `src/pages/Dashboard.tsx` | Substituir dados estáticos por queries reais ao banco |
| `src/pages/Campaigns.tsx` | Exibir métricas reais (envios, cliques, conversão) nos cards |
| `src/pages/Automations.tsx` | Idem para automações |
| `supabase/functions/whatsapp-send/index.ts` | Integrar geração de links encurtados antes do envio |

