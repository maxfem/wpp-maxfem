

# Automação de Carrinho Abandonado — Execução Automática

## Problema
Hoje o sistema sincroniza carrinhos abandonados da Yampi (`yampi-sync`) mas **não dispara nenhuma ação**. O `campaign-executor` só processa campanhas com `status = "scheduled"` e `scheduled_at` no passado — automações com `trigger_type` são ignoradas.

## Solução

### Passo 1 — Criar tabela `automation_queue`
Fila de eventos que vincula um cliente a uma automação para processamento. Evita envios duplicados.

```sql
CREATE TABLE automation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID REFERENCES campaigns(id),
  customer_id UUID REFERENCES customers(id),
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending', -- pending, processing, sent, failed
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
-- Index para busca rápida
CREATE INDEX idx_aq_status ON automation_queue(status, created_at);
-- Unique constraint para evitar envios duplicados por carrinho
CREATE UNIQUE INDEX idx_aq_unique_cart ON automation_queue(customer_id, campaign_id, trigger_type)
  WHERE status IN ('pending', 'processing', 'sent');
```

Com RLS para tenant isolation.

### Passo 2 — Atualizar `yampi-sync` (fase carts)
Ao sincronizar carrinhos, detectar carrinhos **novos ou atualizados** e enfileirar na `automation_queue`:
- Buscar automações ativas (`status = 'running'`, `trigger_type = 'cart_abandoned'`) do tenant
- Para cada carrinho novo, inserir na fila com `status = 'pending'`
- O `UNIQUE INDEX` garante que não haverá duplicatas

### Passo 3 — Atualizar `campaign-executor` para processar a fila
Além de processar campanhas agendadas, o executor também:
1. Busca itens `pending` na `automation_queue`
2. Carrega a automação (campanha) e o template do `flow_data`
3. Envia o template HSM para o cliente específico (usando a mesma lógica de `buildTemplateComponents`)
4. Marca como `sent` na fila e registra em `campaign_activities`

### Passo 4 — Agendar yampi-sync automático via pg_cron
Criar um cron job que chama `yampi-sync` (fase carts) a cada 10 minutos automaticamente, sem precisar de clique manual.

---

## Fluxo Completo
```text
[pg_cron 10min] → yampi-sync (carts)
  → Detecta carrinho abandonado novo
  → Busca automação ativa com trigger_type = 'cart_abandoned'
  → Insere na automation_queue (pending)

[pg_cron 1min] → campaign-executor
  → Busca items pending na automation_queue
  → Envia template HSM para cada cliente
  → Marca como sent + registra campaign_activity
```

## Arquivos Alterados
- **Migração SQL** — tabela `automation_queue` + cron do yampi-sync
- **`supabase/functions/yampi-sync/index.ts`** — enfileirar carrinhos na fila
- **`supabase/functions/campaign-executor/index.ts`** — processar a fila de automações

