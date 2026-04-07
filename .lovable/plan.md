

## Adicionar edição de variáveis nos templates

Atualmente, o formulário detecta variáveis como `{{1}}`, `{{2}}` no corpo da mensagem, mas não oferece campos para preencher valores de exemplo. O banco já possui a coluna `sample_values` (jsonb) na tabela `message_templates`.

### O que será feito

1. **Campos de exemplo para variáveis** — Abaixo do campo "Corpo da mensagem", quando variáveis `{{1}}`, `{{2}}` etc. forem detectadas, exibir inputs dinâmicos para o usuário preencher valores de exemplo (ex: "João", "12345"). Esses valores serão salvos na coluna `sample_values`.

2. **Preview ao vivo com variáveis substituídas** — No `WhatsAppPhonePreview`, substituir `{{1}}`, `{{2}}` pelos valores de exemplo preenchidos, mostrando como a mensagem ficará para o cliente final.

3. **Persistência** — Salvar e carregar os `sample_values` no formulário de criação/edição, incluindo no payload enviado ao banco.

4. **Envio à Meta** — Verificar se a edge function `whatsapp-template` já envia os `sample_values` como exemplos obrigatórios pela API da Meta (campo `example` nos componentes).

### Arquivos alterados

- `src/pages/MessageTemplates.tsx` — Adicionar state `sampleValues`, inputs dinâmicos, incluir no payload de save e no openEdit
- `src/components/WhatsAppPhonePreview.tsx` — Aceitar prop `sampleValues` e substituir `{{N}}` no body antes de renderizar
- `supabase/functions/whatsapp-template/index.ts` — Garantir que `sample_values` sejam enviados no campo `example` da API da Meta

