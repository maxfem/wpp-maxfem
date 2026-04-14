

## Plano: Corrigir Cron Yampi + Reset do Estado

### Problema
1. O SELECT do cron não inclui `last_synced_at`, então `int.last_synced_at` é `undefined` → syncOrders roda sem filtro de data → tenta 460 páginas → CPU timeout
2. O status está travado em `syncing` desde 11/04, bloqueando visualmente
3. O `last_synced_at` está em 11/04 — após a correção, precisa ser atualizado para "agora" para não reprocessar 3 dias de histórico desnecessariamente

### Correções

**Arquivo: `supabase/functions/yampi-sync/index.ts`**

1. **Linha 572** — Incluir `last_synced_at` no SELECT do cron:
   - De: `.select("tenant_id, config, sync_settings")`
   - Para: `.select("tenant_id, config, sync_settings, last_synced_at")`

2. **Linhas 593-598** — Adicionar guard de páginas no loop de orders do cron:
   ```typescript
   const MAX_CRON_PAGES = 30;
   let pagesProcessed = 0;
   while (orderPage && pagesProcessed < MAX_CRON_PAGES) {
     // ...existing logic...
     pagesProcessed++;
   }
   ```

3. **Mesmo guard para carts** (linhas 601-607)

4. **Após o loop do tenant** — Atualizar `last_synced_at` e `sync_status`:
   ```typescript
   await supabase.from("integrations")
     .update({ last_synced_at: new Date().toISOString(), sync_status: "success" })
     .eq("tenant_id", int.tenant_id)
     .eq("provider", "yampi");
   ```

**Reset do estado atual via SQL** — Atualizar a integração para `sync_status = 'pending'` e `last_synced_at = now()` para limpar o estado travado e começar do zero (apenas pedidos novos a partir de agora serão sincronizados).

### Resultado
- Cron volta a funcionar em segundos (apenas pedidos recentes)
- Próximos pedidos de teste serão importados e dispararão automações
- Guard de 30 páginas previne futuros timeouts

