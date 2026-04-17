

## Análise

A captura mostra a mensagem enviada às 07:14 com:
```
[Clique aqui para rastrear o pedido](https://www.loggi.com/rastreador/BLI_16033293224)
```

Dois problemas claros:

1. **A URL ainda aponta para `loggi.com` direto**, não para `rastreio.maxfem.com.br`. Isso significa que a IA está usando o `tracking_url` original do Bling (linkRastreamento da Loggi) ao invés do código. Essa mensagem provavelmente foi gerada **antes** do último deploy, ou o modelo ignorou a instrução porque o JSON do tool ainda contém o campo `tracking_url` da Loggi.

2. **A URL está em formato Markdown** `[texto](url)` — quando o WhatsApp renderiza, o `)` final fica colado na URL, quebrando o link.

A sanitização atual (linhas 770-777) **deveria** converter Markdown para URL crua, mas pelo screenshot vemos que a mensagem foi enviada com Markdown intacto. Possíveis causas: deploy não pegou, ou regex não cobriu o caso.

## Solução definitiva (3 camadas)

### Camada 1 — Eliminar fonte do problema na função `lookupOrdersBling`

Na construção da resposta do tool, **remover completamente** o `tracking_url` original (Loggi/Correios) do JSON retornado para a IA. Devolver apenas:
- `tracking_code` (puro, sem modificação)
- `tracking_url` = `http://rastreio.maxfem.com.br/{tracking_code}` (só esse campo, sobrescrito)

Se não há `tracking_code`, devolver `tracking_url: null`. Assim a IA **nunca vê** a URL da Loggi e não tem como inseri-la na resposta.

### Camada 2 — Sanitização robusta no pós-processamento

Reforçar a regex de sanitização para garantir que QUALQUER formato seja convertido para URL crua:

```ts
suggestion = suggestion
  // 1. Markdown links [texto](url) -> url
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$2')
  // 2. URL entre parênteses (url) -> url (sem parênteses)
  .replace(/\((https?:\/\/[^)\s]+)\)/g, '$1')
  // 3. URL entre colchetes [url] -> url
  .replace(/\[(https?:\/\/[^\]\s]+)\]/g, '$1')
  // 4. Remover pontuação grudada no final da URL
  .replace(/(https?:\/\/[^\s]+?)[)\].,;:!?]+(?=\s|$)/g, '$1')
  // 5. Substituir QUALQUER URL não-maxfem de rastreio por rastreio.maxfem.com.br
  //    (catch-all para URLs Loggi/Correios/Jadlog que escaparem)
  .replace(/https?:\/\/(?:www\.)?(?:loggi\.com|correios\.com\.br|jadlog\.com\.br)\/[^\s]*?([A-Z0-9_-]{8,})[^\s]*/gi,
           'http://rastreio.maxfem.com.br/$1');
```

### Camada 3 — Reforçar prompt do sistema

Adicionar exemplo negativo explícito no `orderInstructions`:

```
EXEMPLOS DO QUE NÃO FAZER:
❌ [Clique aqui](https://www.loggi.com/rastreador/BLI_xxx)
❌ Link: (http://rastreio.maxfem.com.br/BLI_xxx)
❌ http://rastreio.maxfem.com.br/BLI_xxx)

EXEMPLO CORRETO:
✅ Link para rastreamento: http://rastreio.maxfem.com.br/BLI1_6033293224
```

E remover a frase confusa "Link de Rastreamento*: [Clique aqui...]" — instruir para escrever apenas a URL crua precedida de `Link para rastreamento:`.

## Arquivo modificado

- `supabase/functions/ai-copilot/index.ts` (3 trechos: `lookupOrdersBling` retorno, `orderInstructions` prompt, regex de sanitização final)

Após o deploy, peço para você abrir uma conversa nova e pedir rastreio para confirmar que a URL sai limpa, sem parênteses e apontando para `rastreio.maxfem.com.br`.

