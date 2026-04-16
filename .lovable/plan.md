

# Copilot: Rastreio via Bling com formato padronizado

## Contexto

O copilot já busca pedidos no Bling via `lookup_orders_bling`, mas a resposta não segue o formato padronizado solicitado. Precisamos garantir que:
1. O Bling seja SEMPRE a fonte primária para rastreio
2. O formato de resposta siga o modelo exato fornecido
3. Códigos de rastreio e URLs nunca sejam modificados

## Mudanças

### 1. Atualizar instruções do sistema no `ai-copilot/index.ts`

Reforçar no `orderInstructions` (linhas ~579-598):

- Adicionar o template de resposta obrigatório:
```
- Número do pedido: {order_number}
- Status: {status}
- Código de rastreio: {tracking_code}
- Link para rastreamento: http://rastreio.maxfem.com.br/{tracking_code}
```

- Reforçar que a URL deve ser escrita diretamente, sem parênteses, colchetes ou markdown
- Reforçar que o código de rastreio deve ser copiado EXATAMENTE como retornado (underscores, hífens etc.)
- Priorizar `lookup_orders_bling` como ÚNICA fonte para rastreio quando Bling está ativo

### 2. Ajustar `lookupOrdersBling` para usar `http://` no tracking URL

Linha 253: mudar de `https://rastreio.maxfem.com.br/` para `http://rastreio.maxfem.com.br/` conforme o modelo fornecido pelo usuário.

### 3. Ajustar `lookupOrdersByCpf` para consistência

Linha 61: mesma mudança de `https://` para `http://` no tracking URL.

### 4. Sanitização final (linhas 770-777)

Manter a sanitização existente que já remove markdown links e parênteses ao redor de URLs.

### Arquivo modificado
- `supabase/functions/ai-copilot/index.ts`

