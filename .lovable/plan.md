

# Diagnóstico de Rastreabilidade — Lacunas e Plano de Correção

## Situação Atual

O sistema tem a **estrutura** de rastreamento montada, mas falta a **lógica de conexão** entre os eventos. Veja o que funciona e o que não funciona:

| Etapa | Status | Onde |
|---|---|---|
| **Envio** (sent_at) | ✅ Funciona | `campaign-executor` registra `sent_at` |
| **Entrega** (delivered_at) | ❌ Não atualiza | `whatsapp-webhook` atualiza `whatsapp_messages.status` mas **não propaga** para `campaign_activities` |
| **Leitura** (read_at) | ❌ Não atualiza | Mesmo problema acima |
| **Clique** (clicked_at) | ✅ Funciona | `link-redirect` atualiza `campaign_activities.clicked_at` |
| **Resposta** (replied_at) | ❌ Não atualiza | Webhook salva mensagem inbound mas **não marca** `replied_at` em `campaign_activities` |
| **Conversão** (converted_at, conversion_value) | ❌ Não existe | **Não há nenhuma lógica** de atribuição de pedidos a campanhas |

## Problemas Identificados

### 1. Webhook não propaga status para campaign_activities
O `whatsapp-webhook` recebe status updates da Meta (delivered, read, failed) e atualiza apenas `whatsapp_messages.status`. Não faz nenhuma ligação com `campaign_activities`.

### 2. Webhook não registra respostas como atividade
Quando um cliente responde a uma mensagem de campanha, o webhook salva a mensagem mas não marca `replied_at` na atividade correspondente.

### 3. Não existe motor de atribuição de conversões
Quando um pedido novo é sincronizado pela Yampi, **nada** verifica se esse cliente recebeu uma campanha recentemente para atribuir a conversão.

---

## Plano de Implementação

### Passo 1 — Atualizar `whatsapp-webhook` para propagar status

Na seção de status updates, após atualizar `whatsapp_messages`, buscar o `wamid` correspondente e atualizar `campaign_activities`:
- `delivered` → `delivered_at = now()`
- `read` → `read_at = now()`
- `failed` → `status = 'failed'`

### Passo 2 — Atualizar `whatsapp-webhook` para registrar respostas

Na seção de mensagens inbound, verificar se o cliente tem alguma `campaign_activity` recente (últimas 72h) sem `replied_at` e marcar como respondida.

### Passo 3 — Criar lógica de atribuição de conversões no `yampi-sync`

Dentro da fase de sincronização de pedidos (`syncOrders`), ao inserir um pedido novo:
1. Verificar se o cliente tem uma `campaign_activity` nos últimos 3 dias (janela de atribuição)
2. Priorizar atividades com `clicked_at` (atribuição por clique > por envio)
3. Atualizar `converted_at` e `conversion_value` na atividade correspondente

### Passo 4 — Adicionar coluna `attribution_order_id` em `campaign_activities`

Migração para adicionar a coluna que vincula a conversão ao pedido específico, evitando atribuições duplicadas.

---

## Detalhes Técnicos

### Arquivos alterados:
- `supabase/functions/whatsapp-webhook/index.ts` — passos 1 e 2
- `supabase/functions/yampi-sync/index.ts` — passo 3
- Migração SQL — passo 4

### Lógica de atribuição (Passo 3):
```text
Pedido novo inserido
  → Buscar campaign_activity WHERE customer_id = X
    AND sent_at > (now - 72h)
    AND converted_at IS NULL
    ORDER BY clicked_at DESC NULLS LAST, sent_at DESC
    LIMIT 1
  → UPDATE SET converted_at = now(), 
               conversion_value = order.total,
               attribution_order_id = order.id
```

### Propagação de status (Passo 1):
```text
Webhook recebe status "delivered" com wamid
  → SELECT customer_id, tenant_id FROM whatsapp_messages WHERE wamid = X
  → UPDATE campaign_activities SET delivered_at = now()
    WHERE customer_id = Y AND tenant_id = Z
    AND delivered_at IS NULL
    AND sent_at > (now - 48h)
```

