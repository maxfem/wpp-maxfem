# Problema

Na conversa de DM do Instagram, quando o cliente envia um CPF (ex: `117.488.176-39`), o Copilot responde de forma confusa ("Que número diferente é esse?") em vez de buscar o pedido no Bling, retornar status, código de rastreio e link.

# Causa raiz

Existem **dois Copilots distintos** no projeto, e o do Instagram DM não tem acesso às ferramentas de pedido:

| Copilot | Onde roda | Tem ferramenta de CPF/Bling? |
|---|---|---|
| `ai-copilot` (chat manual, painel de contato) | Sugestões manuais no chat | ✅ Sim — `lookup_orders_bling` + `lookup_orders_by_cpf` |
| `generateCopilotReply` dentro de `instagram-send` (auto-reply de DM/comentário) | Resposta automática quando `auto_reply_dms = true` | ❌ Não — só prompt simples no Gemini, sem tool-calling |

O auto-reply do DM (`instagram-send` → `generateCopilotReply`) é um fetch direto ao Lovable AI sem `tools`, então o modelo nunca chama Bling, e ainda recebe a instrução "Nunca invente informações sobre pedidos" — daí a resposta vaga pedindo para o cliente repetir o que precisa.

# Solução

Fazer o auto-reply do DM do Instagram usar o **mesmo motor `ai-copilot`** que já tem acesso ao Bling, em vez do `generateCopilotReply` simplificado.

## Mudanças

### 1. `supabase/functions/instagram-send/index.ts`
- Quando `mode === "auto_reply"` e `channel === "dm"`, **substituir** a chamada a `generateCopilotReply` por uma chamada ao edge function `ai-copilot` (via fetch interno com service role).
- Carregar as últimas ~15 mensagens da conversa (`instagram_messages` filtrando por `tenant_id` + `ig_user_id`) e enviar no formato `{ direction, message_type, content, media_url }` esperado pelo `ai-copilot`.
- Adicionar `conversation_context` informando: "Esta é uma DM do Instagram de @username. Mantenha respostas curtas (máx 4 frases), com 1-2 emojis."
- Manter `generateCopilotReply` apenas para `channel === "comment"` e `channel === "live"` (públicos), pois esses não devem consultar CPF/pedido em comentários abertos.

### 2. `supabase/functions/ai-copilot/index.ts`
- Permitir invocação **server-to-server** (sem JWT de usuário) quando vier do `instagram-send`: aceitar header `x-internal-call: <CRON_SECRET>` como alternativa ao Bearer de usuário, mantendo a validação de JWT para chamadas do front.
- Pequeno ajuste no system prompt para reconhecer canal Instagram DM quando vier no `conversation_context` (já é flexível, basta passar o contexto).

### 3. `src/pages/SettingsInstagram.tsx` (ajuste de UX)
- Adicionar um aviso/toggle explicando: "Auto-resposta de DM usa o Copilot completo (consulta pedidos no Bling por CPF). Auto-resposta de comentários públicos usa apenas resposta amigável (não expõe dados em comentário público)."
- Sem mudança funcional além do texto descritivo do toggle `auto_reply_dms`.

# Comportamento esperado depois

Cliente manda DM no Instagram: `117.488.176-39`

1. Webhook recebe → `instagram-send` (auto_reply, channel=dm) → `ai-copilot` com histórico
2. Modelo detecta CPF → chama `lookup_orders_bling`
3. Bling retorna pedido + tracking_code
4. Resposta automática enviada via DM:
   ```
   Oi! 💖 Encontrei seu pedido:
   - Número do pedido: 12345
   - Status: Enviado
   - Código de rastreio: BLI1_6033293224
   - Link para rastreamento: http://rastreio.maxfem.com.br/BLI1_6033293224
   ```

Se não encontrar, resposta amigável: "Não localizei pedido com esse CPF. Pode confirmar os 11 dígitos? 💖"

# Notas técnicas

- O `ai-copilot` já tem todas as regras de formatação de URL crua, domínio próprio `rastreio.maxfem.com.br` e proteção contra Markdown.
- A janela de 24h de mensagens do Instagram permite responder DMs livres (não-template), então o auto-reply é válido.
- Custos: cada DM com CPF dispara 1-2 chamadas extras (Bling + Gemini round-trip), aceitável.
- Não altera comportamento de comentários públicos nem do fluxo de "purchase intent" (que já manda DM com link de produto).
