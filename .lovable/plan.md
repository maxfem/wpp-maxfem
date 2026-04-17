
Objetivo: corrigir em definitivo o envio de links de rastreio errados. O problema não está só no Copilot. Hoje existem múltiplos caminhos gerando ou reaproveitando URL errada:

1. `ai-copilot` já foi ajustado.
2. `whatsapp-webhook` ainda tem lógica antiga que monta `loggi.com/correios/...` e continua com prompt antigo.
3. `campaign-executor` envia templates/automação usando dados do pedido e pode continuar alimentando variáveis com `tracking_url` antiga.
4. `yampi-sync` continua gravando `tracking_url` original da transportadora no banco.
5. A UI do chat (`ChatMessageArea`) ainda transforma URLs com regex simples e pode incluir `)` no link clicável.
6. O print indica fortemente que há template/mensagem de automação com conteúdo já salvo usando Markdown tipo `[Rastrear pedido](...)`.

Plano de correção definitiva:

### 1. Criar uma regra única e central para rastreio
Implementar um helper backend para normalizar rastreio:
- se existir `tracking_code`, a URL final deve ser sempre `http://rastreio.maxfem.com.br/{tracking_code}`
- nunca usar `tracking_url` de Loggi/Correios/Jadlog
- nunca alterar o `tracking_code`
- nunca devolver markdown, colchetes, parênteses ou pontuação colada na URL

### 2. Aplicar essa regra em TODOS os fluxos que enviam mensagem
Atualizar estes arquivos para usar exatamente a mesma regra:
- `supabase/functions/ai-copilot/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/campaign-executor/index.ts`
- `supabase/functions/whatsapp-send/index.ts`

Trabalho em cada um:
- `whatsapp-webhook`: remover geração de links de transportadora e alinhar o prompt/regras com o `ai-copilot`
- `campaign-executor`: garantir que qualquer variável/template de rastreio use a URL canônica Maxfem
- `whatsapp-send`: adicionar sanitização final de saída, para que mesmo um texto/manual/template malformado seja reescrito antes do envio

### 3. Parar de recontaminar o banco com links errados
Corrigir os pontos que salvam `tracking_url` na tabela `orders`:
- `supabase/functions/yampi-sync/index.ts`
- qualquer lookup de Bling/webhook que ainda monte URL externa

Também incluir uma migração de dados para corrigir registros já existentes:
- para todo pedido com `tracking_code`, sobrescrever `tracking_url` com `http://rastreio.maxfem.com.br/{tracking_code}`

Isso é importante porque hoje mesmo com código novo, mensagens futuras podem continuar puxando `tracking_url` antiga do banco.

### 4. Corrigir a origem mais provável do print: template/automação
Auditar os templates ativos usados no atendimento e automações, principalmente os de pedido/rastreio:
- exemplo provável: `pedido_aprovado_v2` e fluxos de “Pedido Enviado + Rastreio”

Ajustes:
- remover qualquer conteúdo do tipo `[Rastrear pedido](...)`
- remover qualquer URL direta de transportadora
- padronizar para texto puro:
```text
Link para rastreamento: http://rastreio.maxfem.com.br/{tracking_code}
```
Se o template usar variável, garantir que a variável receba a URL canônica e não a original.

### 5. Blindar a renderização no chat
Ajustar `src/components/chat/ChatMessageArea.tsx` para:
- detectar URL sem capturar `)`/`]`/`,`/`.` no final
- não transformar markdown em link quebrado
- exibir corretamente links crus no painel do atendimento

Isso não resolve a origem sozinho, mas evita que a UI continue “quebrando” links quando houver texto com pontuação ao redor.

### 6. Validação end-to-end obrigatória
Depois da implementação, validar 4 cenários separadamente:
1. Copilot buscando rastreio por CPF
2. Resposta automática via `whatsapp-webhook`
3. Automação/template de pedido enviado
4. Envio manual pelo `/atendimento`

Critérios de aceite:
- URL sempre começa com `http://rastreio.maxfem.com.br/`
- nunca aparece `loggi.com`, `correios`, `jadlog` no texto enviado
- nunca aparece markdown `[texto](url)`
- nunca aparece `)` colado no final do link
- `tracking_code` sai exatamente como veio do Bling

### Arquivos que devem entrar no escopo
- `supabase/functions/ai-copilot/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/campaign-executor/index.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/functions/yampi-sync/index.ts`
- `src/components/chat/ChatMessageArea.tsx`

### Detalhe técnico importante
O problema real é de arquitetura de consistência: a correção anterior tratou apenas um emissor (`ai-copilot`), mas o sistema tem outros emissores e ainda persiste links de transportadora no banco. A solução definitiva é:
```text
uma única regra canônica de tracking
+ aplicar em todos os emissores
+ corrigir dados já salvos
+ auditar templates existentes
+ blindar a renderização
```
