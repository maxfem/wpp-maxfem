

# Plano: IA do Chat reconhecer imagem, vídeo e áudio

## Problema atual

O copilot envia apenas o campo `content` (texto) das mensagens para a OpenAI. Quando o cliente envia uma imagem, vídeo ou áudio, a IA recebe apenas `[image]`, `[video]` ou `[audio]` — sem conseguir analisar o conteúdo real da mídia.

## Solução

### 1. Enviar `media_url` nas mensagens para o copilot

**Arquivo:** `src/components/chat/ContactInfoPanel.tsx`

No `handleSuggest`, incluir `media_url` e `message_type` no payload:

```typescript
messages: messages.slice(-20).map((m) => ({
  direction: m.direction,
  content: m.content,
  message_type: m.message_type,
  media_url: m.media_url || undefined,  // ← NOVO
})),
```

### 2. Construir mensagens multimodais na Edge Function

**Arquivo:** `supabase/functions/ai-copilot/index.ts`

Ao montar `chatMessages`, verificar se a mensagem tem `media_url`:

- **Imagem**: usar a API de visão do GPT-4o, enviando `image_url` no content array
- **Vídeo**: enviar uma thumbnail ou descrever como `[Vídeo enviado pelo cliente — URL: ...]` (GPT-4o não processa vídeo diretamente, mas pode receber frames)
- **Áudio**: enviar a URL como contexto `[Áudio enviado pelo cliente — URL disponível: ...]`

Exemplo de formatação para imagens (API multimodal da OpenAI):

```typescript
// Se a mensagem tem media_url e é imagem
if (m.media_url && m.message_type === "image") {
  return {
    role: m.direction === "inbound" ? "user" : "assistant",
    content: [
      { type: "image_url", image_url: { url: m.media_url, detail: "low" } },
      ...(m.content ? [{ type: "text", text: m.content }] : []),
    ],
  };
}
```

Para áudio e vídeo, incluir a URL como texto contextual para que a IA saiba que existe mídia, mesmo sem conseguir processar diretamente.

### 3. Ajustar o system prompt

Adicionar instrução ao prompt do sistema para que a IA saiba que pode receber imagens e descreva o que vê quando relevante.

## Limitações

- **Vídeo**: GPT-4o não processa vídeo diretamente via chat completions. A IA será informada que há um vídeo mas não poderá analisá-lo.
- **Áudio**: Requer chamada separada à API de Whisper para transcrição, ou será tratado como contexto textual.
- O modelo precisa ser `gpt-4o` ou `gpt-4o-mini` (ambos suportam visão). O modelo atual (`gpt-4o-mini`) já suporta.

## Arquivos impactados

- `src/components/chat/ContactInfoPanel.tsx` — enviar `media_url`
- `supabase/functions/ai-copilot/index.ts` — montar mensagens multimodais

