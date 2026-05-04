# Plano: Bling como fonte primária de rastreio nas automações

## Diagnóstico
O template `codigo_rastreio_v2` falha com erro Meta `(#131008) Required parameter is missing` porque o `order.tracking_code` no banco local (sincronizado da Yampi) está vazio na hora do envio. Hoje o `campaign-executor` resolve `order.tracking_code` apenas a partir da tabela `orders` local, e quando vem `"-"` o WhatsApp rejeita o template (que tem `{{3}}` no body e no botão URL).

A integração Bling já é a fonte real do rastreio (NFe + transporte + logística) — a lógica completa já existe no `ai-copilot` (`lookupOrdersBling`). Precisamos reutilizar essa lógica também nas automações.

## Mudanças

### 1. `supabase/functions/campaign-executor/index.ts`

- Adicionar helper `fetchBlingTrackingForOrder(tenantId, document, orderNumber, adminClient)`:
  - Carrega integração `provider='bling'` ativa do tenant.
  - Refresca o access_token se expirado (mesma lógica do ai-copilot — extrair `refreshBlingToken`).
  - Busca contato em `/contatos?pesquisa={cpf-formatado}`.
  - Lista pedidos `/pedidos/vendas?idContato={id}&limit=10`.
  - Tenta casar pelo `numero` igual ao `order_number` da Maxfem; se não casar, usa o mais recente.
  - Para o pedido escolhido, tenta extrair `codigoRastreamento` em ordem:
    1. `transporte.volumes[0].codigoRastreamento`
    2. `/nfe/{notaFiscal.id}` → `transporte.volumes[0].codigoRastreamento`
    3. `/pedidos/vendas/{id}/logistica` → `codigoRastreamento` ou `rastreamento.codigo`
  - Retorna `{ tracking_code, carrier }` ou `null`.

- No bloco `sendWhatsApp` do executor, **antes** de chamar `buildTemplateComponents`:
  - Detectar se o template depende de `order.tracking_code` (procurar a string em `variableMappings` e em URLs de botões via `{{N}}` referenciando esse índice).
  - Se sim e `orderRecord?.tracking_code` estiver vazio:
    - Chamar `fetchBlingTrackingForOrder` usando `customer.document` e `orderRecord?.order_number || triggerData.order_number`.
    - Se vier código: atualizar `orderRecord.tracking_code` em memória **e** persistir em `orders` (`update tracking_code, tracking_url='https://rastreio.maxfem.com.br/{code}', carrier`).
    - Se ainda vier vazio: **não enviar**. Marcar a fila como `pending` com `scheduled_for = now + 1h` para tentar de novo depois (em vez de `failed`), e registrar `campaign_activity` com status `pending` + `error_message='Aguardando código de rastreio do Bling'`. Limitar a no máx. 6 reagendamentos (24h) verificando um campo no `trigger_data` (`bling_retries`).

### 2. Sem mudanças de schema
Reaproveita colunas existentes (`orders.tracking_code`, `orders.tracking_url`, `orders.carrier`, `automation_queue.scheduled_for`, `trigger_data` jsonb).

### 3. Reprocessar fila travada (one-shot, opcional)
Após deploy, opcionalmente reabrir as 136 entradas com `status='failed'` e `current_node_id='wa2'` da campanha `Pedido Aprovado + Rastreio + Entrega` voltando para `pending` para que o executor tente buscar no Bling. Posso fazer isso via insert tool depois do deploy se você confirmar.

## Detalhes técnicos
- O Bling tem rate limit (3 req/s); o executor processa pedidos sequencialmente, então o padrão "1 pedido por iteração" já respeita o limite. Se o Bling retornar 429, tratamos como "tracking ainda não disponível" e reagendamos.
- O token é compartilhado entre `ai-copilot` e o executor — refresh atualiza `integrations.config` para ambos.
- Mantemos a Yampi como fonte secundária: se Bling falhar (sem integração ou sem contato), continuamos olhando `orderRecord.tracking_code` da Yampi como fallback.
- Templates que **não** usam `order.tracking_code` (ex.: `pedido_aprovado_v2`) seguem inalterados.

## Resultado esperado
- `codigo_rastreio_v2` passa a obter o código direto do Bling no momento do envio.
- Envios que ainda não têm código não falham — ficam reagendados até o Bling ter o dado.
- Reduz erro `131008` a zero para esse template.
