

## Diagnóstico: Por que o pedido de teste não gerou trigger

### Causa raiz

O filtro de **cutoff de ativação** na linha 429 descarta o pedido:

```typescript
const activationDate = automation.start_date || automation.updated_at;
if (activationDate && orderDate && new Date(orderDate) < new Date(activationDate)) continue;
```

- A automação "Pix Não Pago" tem `start_date = null`
- Portanto, `activationDate = automation.updated_at` = **2026-04-14 21:34** (atualizado quando o sistema fez alguma modificação)
- O pedido de teste foi criado em **2026-04-14 14:40** (hora na Yampi)
- Como 14:40 < 21:34, o pedido é **descartado** pelo filtro

O problema é usar `updated_at` como fallback — qualquer edição na automação (salvar fluxo, mudar nome, etc.) reseta a janela e ignora pedidos recentes.

### Segundo problema

Mesmo que o trigger fosse enfileirado, o pedido já está com status `cancelled` na Yampi. A condição `isPix && txStatus !== "captured" && orderStatus !== "paid"` poderia casar, mas semanticamente não faz sentido disparar "Pix Não Pago" para pedidos já cancelados.

### Correções

**Arquivo: `supabase/functions/yampi-sync/index.ts`**

1. **Linha 429** — Usar `created_at` da automação como fallback em vez de `updated_at`:
   ```typescript
   const activationDate = automation.start_date || automation.created_at;
   ```
   Isso garante que edições na automação não resetem a janela de cutoff.

2. **Mesma correção na linha 520** (bloco de carrinhos):
   ```typescript
   const activationDate = automation.start_date || automation.created_at;
   ```

3. **Linha 387-389** — Incluir `created_at` no SELECT das automações:
   ```typescript
   .select("id, trigger_type, start_date, updated_at, created_at")
   ```

4. **Linha 414** — Adicionar guard contra pedidos cancelados no trigger de Pix:
   ```typescript
   if (isPix && txStatus !== "captured" && orderStatus !== "paid" && orderStatus !== "cancelled") 
     matchedTriggers.push("order_created_pix");
   ```
   (E equivalente para boleto na linha 415)

**SQL — Reset** para reprocessar o pedido de teste na próxima execução:
- Atualizar `last_synced_at` da integração para um timestamp anterior ao pedido de teste, forçando re-sync

### Resultado
- Automações não perdem triggers por causa de edições no fluxo
- Pedidos cancelados não disparam cobranças indevidas
- O próximo pedido Pix de teste será enfileirado corretamente

