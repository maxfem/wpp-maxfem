

# Plano: Implementar todos os gatilhos de automação faltantes

## Diagnóstico

Existem 11 trigger_types distintos nas automações. Apenas 3 estão implementados no `yampi-sync`:

| Trigger | Status | Fonte |
|---------|--------|-------|
| `cart_abandoned` | Implementado | yampi-sync (carts) |
| `order_created_pix` | Implementado | yampi-sync (orders) |
| `order_created_boleto` | Implementado | yampi-sync (orders) |
| `order_paid` | Implementado | yampi-sync (orders) |
| `order_rejected_card` | Implementado | yampi-sync (orders) |
| `order_approved` | **Faltando** | Mapear status Yampi "aprovado/invoiced" |
| `order_delivered` | **Faltando** | Mapear status Yampi "delivered/entregue" |
| `invoice_issued` | **Faltando** | Mapear status Yampi "invoiced" (NF emitida) |
| `return_approved` | **Faltando** | Mapear status Yampi "returned/exchanged" |
| `first_purchase` | **Faltando** | Detectar cliente com total_orders = 1 |
| `birthday` | **Faltando** | Cron diário comparando data de aniversário |
| `first_purchase_anniversary` | **Faltando** | Cron diário comparando data da 1ª compra |
| `inactivity` | **Faltando** | Cron diário verificando dias desde última compra |
| `7 dias após entrega` | **Faltando** | Cron verificando pedidos entregues há 7 dias |

## Plano de implementação

### 1. Adicionar triggers baseados em status de pedido no `yampi-sync`

No bloco `matchedTriggers` da função `syncOrders`, adicionar:

- **`order_approved`**: quando `orderStatus` for `approved`, `invoiced`, ou `paid`
- **`order_delivered`**: quando `orderStatus` for `delivered` ou `entregue`
- **`invoice_issued`**: quando `orderStatus` for `invoiced`
- **`return_approved`**: quando `orderStatus` for `returned`, `exchanged`, ou similar
- **`first_purchase`**: quando o pedido é `paid` e o cliente tem `total_orders <= 1`

### 2. Criar Edge Function `automation-cron` para triggers baseados em tempo/data

Nova função que roda via cron (1x por dia) e processa:

- **`birthday`**: busca clientes com `custom_attributes->birthday` igual ao dia atual, enfileira para automações ativas com trigger `birthday`
- **`first_purchase_anniversary`**: busca clientes com `last_order_at` completando N anos hoje e `total_orders >= 1`
- **`inactivity`**: busca clientes com `last_order_at` há 30/60/90 dias (confere com o nome da automação), enfileira para a automação correspondente
- **`7 dias após entrega`** (NPS): busca pedidos com status `delivered` entregues há exatamente 7 dias

### 3. Configurar cron job

Agendar `automation-cron` para rodar 1x por dia (ex: 09:00 UTC) via `pg_cron`.

### 4. Garantir campo de aniversário

Verificar se o `yampi-sync` já salva o campo `birthday` do cliente em `custom_attributes`. Se não, adicionar na sincronização de clientes.

## Arquivos impactados

- `supabase/functions/yampi-sync/index.ts` — adicionar triggers de status de pedido + salvar birthday
- `supabase/functions/automation-cron/index.ts` — **novo** — triggers baseados em tempo
- Cron job via `pg_cron` para a nova função

