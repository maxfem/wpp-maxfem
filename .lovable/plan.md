

## Problema

A sincronização Yampi está travada em "syncing" porque Edge Functions têm timeout de ~60 segundos. O padrão "fire-and-forget" (`runSync` em background) não funciona — o runtime Deno mata o processo após enviar a resposta HTTP.

## Solução: Sincronização em Fases

Dividir o sync em 3 chamadas sequenciais, cada uma dentro do limite de timeout. O **frontend** orquestra a sequência.

```text
Frontend                    Edge Function
   |                             |
   |-- POST {phase:"customers"} ->|  (busca e salva clientes)
   |<-- {ok, next:"orders"}  ----|
   |                             |
   |-- POST {phase:"orders"}   ->|  (busca e salva pedidos)
   |<-- {ok, next:"carts"}   ----|
   |                             |
   |-- POST {phase:"carts"}    ->|  (busca e salva carrinhos)
   |<-- {ok, done:true}      ----|
```

## Mudanças

### 1. Edge Function `yampi-sync/index.ts`
- Aceitar parâmetro `phase` (default: `"customers"`)
- Cada fase executa de forma **síncrona** e retorna o resultado + próxima fase
- Fase `customers`: busca clientes da Yampi, insere/atualiza no banco, retorna `{next: "orders", synced: N}`
- Fase `orders`: busca pedidos, faz match com clientes, insere no banco, retorna `{next: "carts", synced: N}`
- Fase `carts`: busca carrinhos abandonados, atualiza customers, marca `sync_status: "success"`, retorna `{done: true}`
- Se qualquer fase falhar, marca `sync_status: "failed"` com a mensagem de erro
- Reduzir `yampiGetAll` para `limit=50, maxPages=20` (1000 registros por fase) para ficar dentro do timeout

### 2. Frontend `SettingsYampi.tsx`
- `syncMutation` agora executa as 3 fases em sequência
- Mostra progresso: "Sincronizando clientes...", "Sincronizando pedidos...", "Sincronizando carrinhos..."
- Se uma fase falhar, para e mostra o erro
- Remove o polling de 5s (não é mais necessário, sync é síncrono por fase)
- Badge de status mostra contadores parciais durante o sync

### 3. Resetar status travado
- Antes de iniciar, se `sync_status === "syncing"`, resetar para `"pending"` via update direto

## Detalhes Técnicos
- Cada fase levará ~10-30s dependendo do volume de dados
- A paginação da Yampi fica com `limit=50` e `maxPages=40` (até 2000 registros por recurso)
- Upserts em batch de 50 registros mantidos
- Service role key usada no Edge Function (já implementado)

