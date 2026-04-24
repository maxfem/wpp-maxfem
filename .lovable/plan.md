# Por que aparece "IG 169001" em vez do @usuário

Hoje o painel de atendimento já tenta mostrar `@username` quando ele existe na tabela `instagram_messages`. O problema é que a coluna `username` está vindo **vazia para quase todas as conversas** (verificado direto no banco: só 1 conversa de ~30 tem username preenchido).

## Causa raiz

Em `instagram-webhook/index.ts`, a função `fetchIgUsername` faz a requisição **somente** em:

```
https://graph.facebook.com/v22.0/{IGSID}?fields=username,name
```

Essa rota funciona apenas quando o token é do tipo **Facebook Page Access Token (EAA...)**. A conta atual da Maxfem usa token de **Instagram Login (IGAA...)** — o mesmo problema de roteamento que já corrigimos em `instagram-send` na rodada anterior. Como a chamada falha, `username` salva como `null` e o front cai no fallback `IG 169001` (últimos 6 dígitos do IGSID).

Além disso, mesmo quando a chamada funciona, hoje só rodamos para mensagens novas (inbound) — todas as conversas antigas continuam com `username = NULL`.

# Solução

## 1. `supabase/functions/instagram-webhook/index.ts` — resolver username em qualquer tipo de token

Reescrever `fetchIgUsername` para tentar, em ordem, todos os endpoints válidos da Meta e devolver o primeiro que responder:

1. `https://graph.instagram.com/v22.0/{IGSID}?fields=username` — Instagram Login (IGAA)
2. `https://graph.facebook.com/v22.0/{IGSID}?fields=username,name` — Facebook Page Token (EAA)
3. `https://graph.instagram.com/v22.0/me/conversations?user_id={IGSID}&fields=participants{username,name}&access_token=...` — fallback usando a conversa (alguns escopos só liberam o nome por aqui)

Logar qual rota teve sucesso para diagnóstico.

## 2. Resolver username também em **outbound** (mensagens enviadas pelo painel)

Hoje só tentamos resolver quando `isInbound = true`. Vamos resolver também em outbound (echo) quando o registro ainda não tem username — isso garante que conversas iniciadas por nós também sejam batizadas.

## 3. Backfill em massa das conversas antigas

Criar função utilitária `backfillUsernames(account)` que:
- Lista todos os `ig_user_id` distintos de `instagram_messages` da conta com `username IS NULL`.
- Para cada um, chama `fetchIgUsername` (com small concurrency, ex.: 3 em paralelo, e respeita rate-limit com pequeno delay).
- Atualiza todas as mensagens daquele `ig_user_id` com o username encontrado.
- Atualiza também o `customers.name` para `@username` quando o nome atual começar com `IG ` (placeholder) ou estiver vazio.

Disparar esse backfill de duas formas:
- **Automático**: quando o webhook recebe uma nova mensagem e descobre o username, já fazemos o backfill local da conversa (isso já existe).
- **Sob demanda**: nova edge function `instagram-backfill-usernames` que aceita `{ tenant_id }` e roda o backfill para todas as contas IG ativas do tenant. Útil para regularizar o histórico de uma vez.

## 4. Botão "Atualizar nomes do Instagram" em `/settings/instagram`

Adicionar em `src/pages/SettingsInstagram.tsx` um botão que chama a edge function `instagram-backfill-usernames` para o tenant atual e mostra um toast com o total atualizado. Sem esse botão o usuário não consegue regularizar as conversas antigas sem esperar nova mensagem.

## 5. Atualização do `customers.name` no caminho normal

Em `resolveCustomerByIgUser`, hoje só sobrescrevemos `name` se o nome começar com `IG `. Vamos manter, mas também atualizar quando `name` for igual a `@oldUsername` e o IG tenha mudado de handle. Pequeno ajuste defensivo.

## 6. Front-end (sem mudanças visuais grandes)

Nenhuma mudança de UI necessária — `Chat.tsx`, `ChatHeader`, `ChatSidebar` e `ContactInfoPanel` já usam `customerName`, que vira `@username` automaticamente assim que os dados forem preenchidos pelo backfill. Apenas garantir que, ao renderizar, se `customerName` for placeholder `IG xxxxxx`, exibimos um pequeno "Atualizando…" tooltip seria uma melhoria opcional — não vou incluir agora para manter o escopo enxuto.

# Comportamento esperado depois

- Toda nova DM ou comentário inbound resolve o `@username` corretamente, independentemente do tipo de token (IGAA ou EAA).
- O usuário clica em "Atualizar nomes do Instagram" em `/settings/instagram` uma vez e todas as conversas antigas passam a mostrar `@usuario` em vez de `IG 169001`.
- O nome dos clientes IG na tabela `customers` também passa a refletir o handle real (`@su.elen1984`, etc.), o que melhora também a busca, listas e segmentações.

# Arquivos a editar / criar

- `supabase/functions/instagram-webhook/index.ts` — reescrever `fetchIgUsername` com 3 fallbacks + resolver em outbound.
- `supabase/functions/instagram-backfill-usernames/index.ts` — **novo**, edge function para backfill em massa.
- `src/pages/SettingsInstagram.tsx` — botão "Atualizar nomes do Instagram" + toast de progresso.

# Notas técnicas

- Rate-limit Meta: limitar concorrência a 3 e adicionar 200ms de delay entre lotes para não bater limite.
- O backfill grava `username` em `instagram_messages` (todos os registros do `ig_user_id`) e atualiza `customers.name` quando placeholder.
- Logs detalhados para diagnosticar contas onde nenhum dos 3 endpoints responde (token expirado, escopo faltando).
