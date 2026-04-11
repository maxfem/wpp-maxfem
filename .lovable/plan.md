

# Correção definitiva: lookup local + sync completo para IA do WhatsApp

## Situação atual

O código do webhook e do copilot **já está correto** — a busca local por CPF funciona e retorna os dados. O problema é que:

1. **Pagamentos (payment_summary) estão vazios em 100% dos pedidos** — a API da Yampi no modo lista (`orders?include=payments`) não retorna dados de pagamento para todos os pedidos. Só vem no detalhe individual.
2. **O refresh_tracking processa apenas 20 pedidos por vez**, deixando muitos sem rastreio.
3. **O prompt da IA não é assertivo o suficiente** — quando tem tracking_code, a IA deveria retornar de forma clara e direta com o código e o link.

## Plano de correção

### 1) Melhorar o sync de pedidos individuais
No `yampi-sync`, para pedidos enviados (shipped/on_carriage/in_transit), buscar detalhes individuais (`orders/{id}`) para capturar:
- `track_code` e `track_url` (rastreio)
- Dados de pagamento que não vêm na listagem
- Aumentar o limite de 20 para 50 pedidos por refresh

### 2) Corrigir extração de pagamentos
No `yampi-sync`, quando `paymentSummary` vier vazio da listagem, buscar o detalhe individual do pedido para extrair os dados de pagamento reais (método, valor, parcelas).

### 3) Reforçar o prompt da IA
No `whatsapp-webhook`, atualizar as instruções do sistema para:
- Quando o tracking_code existir, **sempre** informar o código e o link de rastreio
- Formatar a resposta com dados concretos (número do pedido, status, código, link)
- Não dizer "código ainda não foi atualizado" quando o código EXISTE nos dados

### 4) Re-sincronizar pedidos
Rodar a sincronização completa (customers + orders + refresh_tracking) para popular os campos que estavam faltando.

## Arquivos impactados
- `supabase/functions/yampi-sync/index.ts` — melhorar extração de pagamento e aumentar limite de refresh
- `supabase/functions/whatsapp-webhook/index.ts` — reforçar prompt da IA para ser mais direto com dados de rastreio
- `supabase/functions/ai-copilot/index.ts` — mesma melhoria no prompt

## Resultado esperado
Após as correções, quando um cliente informar o CPF no WhatsApp:
- A IA vai retornar o código de rastreio e o link quando disponíveis
- Os pagamentos vão aparecer nos dados do pedido
- A resposta será direta e concreta, sem ambiguidade

