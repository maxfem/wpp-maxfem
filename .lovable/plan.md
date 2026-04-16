

# Fix: Pedidos Pix aparecendo como "Pendente" mesmo já pagos

## Problema

Na `yampi-sync`, linha 305, a lógica que determina se um Pix está pendente é:
```typescript
const isPix = txList.some((tx: any) => tx.payment?.data?.is_pix && tx.status !== "captured");
```

O problema é que a Yampi usa **"paid"** (não "captured") para Pix confirmado. Como `"paid" !== "captured"` é `true`, **todo pedido Pix é marcado como `pix_pending`**, mesmo os já pagos.

Na linha 342:
```typescript
mapped_status: isPix ? "pix_pending" : mappedStatus,
```

Resultado: `mapped_status` fica eternamente `"pix_pending"`.

## Solução

1. **Corrigir a condição `isPix` em `yampi-sync/index.ts`** — considerar que Pix está pendente apenas quando o status da transação indica pagamento não confirmado. Trocar para:
```typescript
const isPix = txList.some((tx: any) => 
  tx.payment?.data?.is_pix && 
  !["captured", "paid", "approved"].includes(tx.status)
);
```

2. **Corrigir também a lógica de `mapped_status`** — quando o order status já indica pagamento (paid, invoiced, shipped, delivered), o `mapped_status` deve refletir isso, não ficar em `pix_pending`:
```typescript
const paidStatuses = ["paid", "invoiced", "shipped", "on_carriage", "in_transit", "delivered"];
mapped_status: isPix && !paidStatuses.includes(mappedStatus) ? "pix_pending" : mappedStatus,
```

3. **Corrigir os pedidos existentes no banco** — executar um UPDATE nos pedidos onde `mapped_status = 'pix_pending'` mas o `status` ou `payment_summary` já indica pagamento confirmado.

4. **Redeployar a edge function** `yampi-sync`.

## Arquivos modificados
- `supabase/functions/yampi-sync/index.ts` (linhas 305 e 342)
- Migration SQL para corrigir dados existentes

