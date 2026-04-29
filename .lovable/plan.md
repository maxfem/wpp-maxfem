## Pixel de Rastreamento Maxfem para Shopify (e qualquer site)

Criar um pixel JavaScript próprio (estilo Meta Pixel / RD Station) que, instalado na Shopify (ou em qualquer loja), identifica visitantes, registra páginas vistas e produtos visualizados, e dispara automações de remarketing por **E-mail** (SES) e **WhatsApp** (quando houver telefone conhecido).

---

### 1. Banco de dados (nova migration)

Aproveitar o que existe (`customers`, `tracked_links`, `link_clicks`, `automation_queue`) e adicionar:

- **`pixel_visitors`** — identidade anônima do navegador
  - `id`, `tenant_id`, `visitor_id` (uuid gerado no browser, salvo em cookie/localStorage `mxf_vid`)
  - `customer_id` (nullable — preenchido quando o visitante é identificado)
  - `email`, `phone`, `document` (nullable)
  - `first_seen_at`, `last_seen_at`, `user_agent`, `ip`, `country`, `city`
  - Índice único `(tenant_id, visitor_id)`

- **`pixel_events`** — eventos brutos
  - `id`, `tenant_id`, `visitor_id`, `customer_id` (nullable)
  - `event_type` (`page_view`, `product_view`, `add_to_cart`, `checkout_started`, `purchase`, `identify`, `custom`)
  - `url`, `referrer`, `page_title`
  - `product_id`, `product_name`, `product_price`, `product_image`, `product_url`, `variant_id`, `currency`
  - `cart_value`, `order_id` (para purchase)
  - `metadata` (jsonb), `session_id`, `created_at`
  - Índices: `(tenant_id, visitor_id, created_at desc)`, `(tenant_id, event_type, created_at desc)`, `(tenant_id, customer_id)`

- **`pixel_sessions`** — agregado por sessão (para abandono de navegação)
  - `id`, `tenant_id`, `visitor_id`, `customer_id`, `started_at`, `last_activity_at`, `ended` bool, `pages_viewed`, `products_viewed` (jsonb array dos últimos N), `cart_value`

- RLS: tenant isolation em todas (somente a Edge Function de ingestão escreve via service role; o frontend do CRM faz select por `tenant_id`).

- Trigger: ao inserir `pixel_events` com `event_type='identify'` e email/phone, chamar função que faz **match com `customers`** (por email > phone > document) e propaga `customer_id` retroativamente para todos os `pixel_visitors`/`pixel_events` daquele `visitor_id`.

---

### 2. Edge Functions

- **`pixel-collect`** (verify_jwt = false, público)
  - Recebe `POST` do pixel JS com batch de eventos
  - Valida `tenant_key` (chave pública por tenant — adicionar coluna `pixel_public_key` em `tenants`)
  - Faz upsert em `pixel_visitors`, insere `pixel_events`, atualiza `pixel_sessions`
  - Lookup de IP → país/cidade (via header Cloudflare ou serviço grátis)
  - CORS aberto

- **`pixel-script`** (verify_jwt = false, público)
  - Serve o JS do pixel dinamicamente: `GET /functions/v1/pixel-script?key=PUB_KEY`
  - Retorna o bundle minificado com a `tenant_key` embutida e `endpoint` apontando para `pixel-collect`

- **`pixel-abandonment-cron`** (cron a cada 15min)
  - Detecta sessões com `last_activity_at` entre 30min e 24h atrás, com `products_viewed > 0` e SEM `purchase` posterior
  - Para visitantes com `customer_id` (identificados): cria item em `automation_queue` com trigger `browse_abandonment` ou `cart_abandonment` (se houve `checkout_started`)
  - Garantir deduplicação via unique index na queue (já existe padrão)

---

### 3. O Pixel JavaScript (`public/pixel/mxf.js` + servido pela edge)

Funções expostas em `window.mxf`:
```js
mxf('init', 'PUB_KEY')                          // auto no script
mxf('page')                                      // page_view automático
mxf('identify', { email, phone, name, document })// quando o cliente loga/checkout
mxf('product', { id, name, price, image, url })  // product_view
mxf('cart', { value, items })                    // add_to_cart
mxf('checkout', { value, items })                // checkout_started
mxf('purchase', { order_id, value, items })      // purchase
mxf('track', 'custom_event', {...})              // custom
```

Características:
- Cookie `mxf_vid` (1 ano) + fallback `localStorage`
- SPA-aware: hooks em `history.pushState` e `popstate`
- Batch + `navigator.sendBeacon` no unload
- Detecção automática Shopify: lê `window.ShopifyAnalytics`/`Shopify.checkout` para extrair `email`, `order_id`, `cart`
- Parse de UTMs e atribuição persistente

---

### 4. Integração Shopify

Página nova **`/settings/pixel`**:
- Mostra `tenant.pixel_public_key` (gera se não existir)
- Snippet pronto para colar no `theme.liquid` antes de `</head>`:
  ```html
  <script async src="https://<projeto>.functions.supabase.co/pixel-script?key=PUB_KEY"></script>
  ```
- Snippet alternativo via **Shopify Web Pixel** (Customer Events) com extração nativa de `product_viewed`, `checkout_started`, `checkout_completed`
- Botão "Testar instalação" — chama edge que verifica último evento dos últimos 5 min
- Documentação inline para Yampi, Nuvemshop, sites custom

---

### 5. Triggers de Automação

Em `Automations` adicionar 2 novos gatilhos no seletor:

- **Navegação Abandonada** (`browse_abandonment`)
  - Cliente identificado viu produto(s) X minutos atrás e não comprou
  - Variáveis disponíveis no template: `{{produto_nome}}`, `{{produto_url}}`, `{{produto_imagem}}`, `{{produto_preco}}`

- **Carrinho Abandonado via Pixel** (`cart_abandonment_pixel`)
  - Independente da Yampi — funciona em qualquer loja com pixel
  - Variáveis: `{{carrinho_valor}}`, `{{carrinho_itens}}`, `{{checkout_url}}` se disponível

Ambos podem ramificar para nó `sendEmail` (SES) e/ou `sendWhatsApp` condicionado a `phone IS NOT NULL` e janela de 24h.

2 templates prontos em **Automações Prontas**:
- "Você esteve no nosso site" (e-mail + WhatsApp)
- "Esqueceu seu carrinho?" (e-mail + WhatsApp)

---

### 6. UI/Dashboard

Nova página **`/pixel`** (sidebar em "Tracking"):
- KPIs: visitantes únicos hoje/7d/30d, identificados vs anônimos, taxa identificação, produtos mais vistos, abandono detectado
- Tabela de eventos recentes com filtro por `visitor_id`/`customer_id`
- Funil: visita → produto visto → carrinho → checkout → compra
- Linha do tempo de cada visitante (clicar abre drawer com todos os eventos)

---

### 7. Atribuição de conversão

Estender o trigger de `orders` (já existe pra link click): quando uma order chega, procurar por `pixel_events` recentes (24h) do mesmo `customer_id` com `event_type='product_view'` e marcar `attributed_to_pixel=true` na `campaign_activities` se houve campanha de remarketing enviada antes.

---

### Stack técnico
- Supabase (Postgres + RLS + 3 Edge Functions + cron)
- Pixel JS vanilla (~5KB minificado, zero dependências)
- Frontend React/TypeScript já existente
- E-mail via SES (`campaign-executor` já implementado)
- WhatsApp via `whatsapp-send` (respeitando janela 24h e templates HSM)

---

### Entregáveis desta fase
1. Migration com 3 tabelas + RLS + trigger de identificação
2. 3 Edge Functions (`pixel-collect`, `pixel-script`, `pixel-abandonment-cron`)
3. Pixel JS (`public/pixel/mxf.js`)
4. Página `/settings/pixel` com snippet e teste
5. 2 novos triggers em Automations + 2 templates prontos
6. Página `/pixel` com dashboard e timeline
7. Atribuição automática de orders ao pixel
