

O usuário aponta que a URL saiu como `http://rastreio.maxfem.com.br/BLI16033192248` mas o código correto é `BLI_16033192248`. O underscore foi removido em algum ponto do pipeline.

Hipóteses do que está comendo o `_`:

1. **Renderização Markdown na UI**: olhando a screenshot, o texto aparece como `BLI16033192248` em itálico. Isso é um forte indício de que o `_..._` foi interpretado como Markdown itálico pelo renderizador da bolha de mensagem. O texto original muito provavelmente é `BLI_16033192248_` ou `BLI_16033192248.` e algum parser de markdown comeu os underscores e renderizou como itálico.
2. **Sanitização do `whatsapp-send`**: o regex de "remover pontuação grudada" pode estar comendo `_`? Não, ele só remove `)`, `]`, `.`, `,`, `;`, `:`, `!`, `?`, `*`. Então não é isso.
3. **Regex de URL no `ChatMessageArea`**: preciso conferir se a regex atual `[^\s<>)\]]+[^\s<>)\].,;:!?*]` corta `_`. Não, `_` não está na lista. Mas o texto exibido é "BLI16033192248" com itálico — isso vem de algum lugar. Possivelmente o componente passa por um renderer de markdown ou itálico custom.

Vou verificar o `ChatMessageArea.tsx` para ver se há renderização de markdown/itálico que captura `_texto_` como itálico, transformando `BLI_16033192248` em `BLI<em>16033192248</em>`.

Confirmado pelo print: o número aparece em itálico. Isso é 100% Markdown italic do `_`. Precisamos garantir que dentro de URLs nada de markdown seja aplicado, e que ao salvar no DB / enviar pelo WhatsApp o `_` seja preservado.

Solução:
- No `ChatMessageArea`, ao tokenizar, precisamos detectar URLs PRIMEIRO e não aplicar nenhuma transformação de markdown (`*bold*`, `_italic_`) dentro delas.
- O texto que vai pro WhatsApp em si está correto (o WhatsApp também usa `_italic_`, mas dentro de URL ele tipicamente preserva). O bug crítico é a UI quebrando visualmente, e potencialmente o usuário copiando errado, mas a URL real enviada provavelmente está com `_`.

Preciso confirmar isso lendo `ChatMessageArea.tsx` e `whatsapp-send` outbound. Vou também checar o `ai-copilot` para garantir que ele não está envolvendo a URL com markdown italic acidentalmente.

