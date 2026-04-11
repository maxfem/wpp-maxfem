
# Alternativa melhor: WhatsApp consultar dados já sincronizados no sistema

## Diagnóstico
Pelo código e pelos logs, o problema não é só a IA “entender errado”. Hoje o WhatsApp depende de consulta ao vivo na Yampi para pegar rastreio/pagamento, e isso está falhando porque:

- o `whatsapp-webhook` busca na Yampi em tempo real por CPF
- os logs mostram status `on_carriage` com `tracking_code: null` e `tracking_url: null`
- a base local hoje guarda muito pouco do pedido:
  - tabela `orders` só tem `external_id`, `total`, `status`, `mapped_status`, `created_at`
  - não existem colunas para rastreio, link, transportadora, pagamento, CPF do pedido, itens etc.
- o `yampi-sync` já traz clientes e pedidos, mas não persiste os campos ricos que a IA precisa
- o chat já consulta `customers` e `orders` da plataforma, então faz mais sentido usar a plataforma como fonte principal

## Solução proposta
Trocar a estratégia:

1. **A integração da Yampi continua sincronizando**
   - clientes
   - pedidos
   - rastreio
   - link de rastreio
   - transportadora
   - pagamentos
   - itens principais
   - CPF/documento do cliente

2. **O WhatsApp deixa de depender da Yampi ao vivo**
   - ao invés de buscar direto na Yampi, ele consulta os dados já sincronizados na base
   - isso deixa a resposta mais estável, rápida e previsível

3. **O CPF vira chave de busca local**
   - salvar CPF normalizado no cliente
   - permitir localizar o cliente e os pedidos pela base local
   - se faltarem dados localmente, a IA responde com o que existe no sistema, sem “inventar”

## O que implementar

### 1) Enriquecer o modelo de dados
Criar migração para expandir `orders` com campos como:

- `tracking_code`
- `tracking_url`
- `carrier`
- `delivery_estimate`
- `payment_summary` (jsonb)
- `items_summary` (jsonb)
- `order_number`
- `status_alias`
- `raw_payload` (jsonb, opcional para debug)
- `customer_document` ou usar CPF no cliente de forma consistente

E padronizar o CPF no `customers`, preferencialmente em coluna própria ou em `custom_attributes.cpf_normalized` com regra consistente.

### 2) Melhorar o sync da Yampi
Atualizar `supabase/functions/yampi-sync/index.ts` para:

- salvar CPF normalizado no cliente
- salvar mais detalhes do pedido
- mapear corretamente status como `on_carriage`
- tentar fallback por detalhe do pedido quando faltar rastreio
- atualizar também pedidos já existentes com novos dados de envio/pagamento

### 3) Criar lookup local para IA
Substituir a tool atual por uma busca na plataforma, por exemplo:

- localizar cliente por CPF normalizado
- buscar últimos pedidos na tabela `orders`
- montar resposta com:
  - status
  - rastreio
  - link
  - pagamento
  - data
  - transportadora

Se quiser, posso manter um fallback opcional para a Yampi só quando a base local estiver vazia, mas a fonte principal será o sistema.

### 4) Ajustar `whatsapp-webhook`
Em `supabase/functions/whatsapp-webhook/index.ts`:

- trocar `lookup_orders_by_cpf` de consulta ao vivo para consulta local
- atualizar instruções da IA para usar “dados do cliente na plataforma”
- tratar ausência de rastreio com resposta segura, por exemplo:
  - “encontrei seu pedido e ele está em transporte, mas o código ainda não foi sincronizado”
  - em vez de afirmar incorretamente que não existe

### 5) Ajustar `ai-copilot`
Em `supabase/functions/ai-copilot/index.ts`:

- mesma troca da tool para lookup local
- manter a lógica de pedir CPF quando falarem de pedido/rastreio/entrega/pagamento
- devolver para o atendente uma sugestão baseada no cadastro local do cliente

### 6) Melhorar a visualização no sistema
Aproveitar os dados sincronizados no painel lateral do chat (`ContactInfoPanel`) para mostrar:

- número do pedido
- status amigável
- código de rastreio
- link de rastreio
- transportadora
- pagamento

Isso ajuda a conferência manual quando necessário.

## Arquivos impactados
- `supabase/functions/yampi-sync/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/ai-copilot/index.ts`
- `src/components/chat/ContactInfoPanel.tsx`
- `src/pages/Chat.tsx`
- nova migration em `supabase/migrations/...`

## Observações técnicas
- Hoje os logs já indicam um status vindo da Yampi que não está bem tratado: `on_carriage`
- o modelo atual de `orders` é insuficiente para atendimento via IA
- a alternativa mais robusta é transformar a sincronização em “fonte de verdade” para o WhatsApp
- isso também reduz latência e dependência de resposta externa no momento da mensagem

## Resultado esperado
Depois dessa mudança:

- a Yampi alimenta a base com os dados completos
- o WhatsApp consulta o cliente/pedido já dentro da plataforma
- a IA continua pedindo CPF quando necessário
- o retorno fica consistente por conversa e não depende de a API externa trazer tudo naquele instante
- rastreio, link e pagamento ficam disponíveis tanto para IA quanto para o operador no painel

## Ordem de execução
1. criar migração para enriquecer pedidos/dados de cliente
2. atualizar sync da Yampi para persistir os campos completos
3. trocar lookup da IA e do webhook para consulta local
4. ajustar exibição no painel do chat
5. validar com um CPF real já sincronizado e conferir a resposta no WhatsApp
