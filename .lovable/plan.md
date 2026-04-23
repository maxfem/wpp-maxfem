

# Integração Instagram no /atendimento (Fase 1: DMs + Comentários + Lives)

## Decisões confirmadas
1. **Mesmo App Meta** do WhatsApp (reusa App Review e Business Verification)
2. **Múltiplas contas IG por tenant** (cada tenant pode conectar várias contas IG)
3. **Auto-resposta em Lives**: totalmente automática (com filtros de segurança)
4. **UI**: tudo dentro de `/atendimento` com filtro WhatsApp / Instagram

## Arquitetura

```text
Instagram (DM | comentário | live | mention)
        │
        ▼
  Meta Webhook ──► edge: instagram-webhook
                       │
                       ├─► instagram_messages / instagram_comments / instagram_live_comments
                       ├─► resolve customer (por ig_user_id + @username)
                       └─► dispara Copilot (Gemini multimodal)
                                │
                                ▼
                        /atendimento
                        ┌─ Filtro: [Todos] [WhatsApp] [Instagram]
                        ├─ Sidebar unificada (conversas dos 2 canais)
                        ├─ ChatHeader (badge do canal)
                        ├─ ChatMessageArea (mesma UI)
                        └─ ChatInput → instagram-send | whatsapp-send
```

## Banco de dados (novas tabelas)

| Tabela | Função |
|---|---|
| `instagram_accounts` | Contas IG conectadas: `tenant_id`, `ig_user_id`, `username`, `page_id`, `access_token`, `is_active`, `auto_reply_lives` (bool), `auto_reply_dms` (bool) |
| `instagram_messages` | DMs (espelha `whatsapp_messages`): `direction`, `content`, `message_type`, `status`, `customer_id`, `ig_account_id`, `ig_conversation_id`, `media_url`, `metadata` |
| `instagram_comments` | Comentários em posts/Reels: `post_id`, `comment_id`, `parent_comment_id`, `from_username`, `from_ig_user_id`, `content`, `replied`, `reply_id` |
| `instagram_live_comments` | Comentários em Lives: `live_id`, `comment_id`, `from_username`, `content`, `auto_replied`, `created_at` |

Reusa `customers.custom_attributes.instagram = { ig_user_id, username, follower_count }` para unificar contato (mesma pessoa que tem WhatsApp e Instagram = 1 customer).

RLS: padrão `is_tenant_member` (mesmo do WhatsApp).

## Edge Functions novas

1. **`instagram-register`** — fluxo OAuth Meta: usuário autoriza → lista Pages → escolhe Page com IG vinculado → salva `ig_user_id` + token longa duração (60d) em `instagram_accounts`.
2. **`instagram-webhook`** — recebe eventos da Meta (`messages`, `messaging_postbacks`, `comments`, `live_comments`, `mentions`). Verify token reusa o do WhatsApp.
3. **`instagram-send`** — envia DM, responde comentário, responde live comment, "Send Private Reply" (converte comentário em DM).
4. **`instagram-token-refresh`** (cron diário) — renova tokens IG antes dos 60 dias expirarem.
5. **`instagram-live-poller`** (cron 30s) — quando há Live ativa detectada, busca novos `live_comments` em tempo real e dispara auto-resposta via Copilot.

## Telas

### `/settings/instagram` (nova)
- Botão "Conectar Instagram" → OAuth Meta
- Lista de contas IG conectadas (multi-conta)
- Por conta: toggles `auto_reply_dms`, `auto_reply_lives`, `auto_reply_comments`
- Status do token (dias até expirar)

### `/atendimento` (modificações)
- **Filtro novo no topo da sidebar**: tabs `[Todos] [WhatsApp 12] [Instagram 5]`
- **Conversas unificadas**: WhatsApp + Instagram DMs misturados ordenados por `lastMessageAt`, cada item com badge do canal (ícone WhatsApp verde / Instagram gradiente)
- **ChatHeader**: mostra badge do canal + @username quando IG
- **ChatInput**: detecta canal automaticamente e roteia para `instagram-send` ou `whatsapp-send`
- **ContactInfoPanel**: mostra dados do IG (followers, username, link do perfil) quando aplicável

### Nova subview: `/atendimento` aba "Comentários"
- Lista comentários pendentes (todos os posts/Reels) com preview do post, autor, conteúdo
- Ações: "Responder publicamente" / "Send Private Reply" (converte em DM) / "Copilot sugerir resposta"

### Nova subview: `/atendimento` aba "Live" (visível só durante Live)
- Stream em tempo real dos comentários
- Modo auto-piloto on/off por Live
- Log de respostas automáticas enviadas

## Copilot adaptado

Mesmo motor (Gemini multimodal prioritário, OpenAI fallback).
Prompt do sistema ganha contexto do canal: "Responda em tom Instagram (mais informal, emojis, ≤2200 chars)."

**Auto-resposta em Lives (filtros de segurança)**:
- Ignora comentários `< 3 chars` (ex: "oi", "👏")
- Ignora se já respondeu pra mesmo `from_ig_user_id` nos últimos 60s (anti-spam)
- Ignora comentários que parecem spam (link externo, palavras bloqueadas)
- Limita a 1 resposta a cada 5 segundos (rate limit Meta)

**Auto-resposta em DMs** (opcional por conta):
- Só responde se está dentro da janela de 24h
- Se fora: registra na fila pra resposta manual

## Janela de 24h e Message Tags

DMs do Instagram seguem a **mesma regra de 24h** do WhatsApp.
Fora da janela, não há HSM — usa **Message Tags** Meta:
- `HUMAN_AGENT` (atendimento humano em até 7d)
- `ACCOUNT_UPDATE` / `POST_PURCHASE_UPDATE` / `CONFIRMED_EVENT_UPDATE`

Reusa o `extractFnError` que já existe em `Chat.tsx` para tratar erros.

## Storage e mídia

Reusa bucket `whatsapp-media` (renomeio implícito não vale a pena agora; conteúdo é equivalente). Mídia recebida em DMs IG é baixada via webhook e armazenada com prefixo `instagram/` para separação lógica.

## Pré-requisitos que você precisa providenciar

1. ✅ App Meta já existe (mesmo do WhatsApp)
2. ⚠️ Adicionar produto **Instagram** + **Messenger** ao App no painel Meta
3. ⚠️ Conta IG **Business ou Creator** vinculada à Página do Facebook (para cada conta a conectar)
4. ⚠️ Submeter App Review pedindo: `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_manage_metadata`, `pages_read_engagement`
5. ⚠️ Configurar webhook IG no painel Meta apontando para `https://poukhwsbskcvwroeqoct.supabase.co/functions/v1/instagram-webhook` com mesmo verify token do WhatsApp

## O que NÃO entra agora

- Postar conteúdo (feed/Reels/Stories) — só atendimento
- Responder DMs em Lives de terceiros — só nos seus
- Ler DMs antigas (anteriores à conexão) — webhook é forward-only
- Conta IG pessoal (só Business/Creator)

## Plano de entrega faseado

| Fase | Escopo | Quando |
|---|---|---|
| **1A** | Tabelas + `instagram-register` + `/settings/instagram` (multi-conta) | Primeiro |
| **1B** | `instagram-webhook` (DMs) + filtro no `/atendimento` + `instagram-send` (DMs) | Segundo |
| **2** | Aba "Comentários" + `instagram-send` (comments + Send Private Reply) | Terceiro |
| **3** | Aba "Live" + `instagram-live-poller` + auto-resposta com filtros | Quarto |
| **4** | Cron de refresh de token + Stories mentions | Quinto |

Recomendo aprovar o plano completo e executar as fases em sequência sem pausas (cada fase ~1 mensagem).

## Detalhes técnicos

- **Tokens IG**: criptografados em `instagram_accounts.access_token`. Refresh automático via cron diário (`instagram-token-refresh`) — Meta long-lived token dura 60d e pode ser renovado quando faltarem ≤7 dias.
- **Identificação de cliente**: lookup por `ig_user_id` em `customers.custom_attributes->>'instagram'->>'ig_user_id'`. Se não existir, cria customer novo com `name = @username`. Merge manual via UI futura.
- **Multi-conta**: cada conversa carrega `ig_account_id` para saber qual token usar no envio.
- **Auto-piloto Live**: poller roda em loop 30s buscando contas com Live ativa (campo `live_active_id` em `instagram_accounts`); webhook `live_comments` ativa esse flag.
- **Reusa toda a UI**: `ChatSidebar`, `ChatHeader`, `ChatMessageArea`, `ChatInput`, `ContactInfoPanel` ganham prop `channel` opcional para variações visuais mínimas.
- **Roteamento**: `Chat.tsx` ganha source unificada que junta `whatsapp_messages` + `instagram_messages` em uma só lista de conversas.

