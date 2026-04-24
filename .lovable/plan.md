
## Objetivo

Criar um mecanismo no estilo ManyChat: quando alguém comentar uma palavra-chave (ou demonstrar intenção semelhante) em um post/Reel/Live do Instagram, o sistema responde publicamente no comentário e dispara automaticamente uma mensagem privada (DM) configurada — com link, mídia e UTMs.

## Como o usuário vai usar

1. Acessa **Configurações → Instagram → Regras de Comentário → DM** (nova aba na página `/settings/instagram`).
2. Clica em **Nova regra** e preenche:
   - **Nome da regra** (ex.: "Imunofem - link de compra").
   - **Aplicar em**: todos os posts da conta, posts específicos (cola o link/permalink ou seleciona dos últimos 25 posts via Graph API), posts ao vivo, ou todos.
   - **Gatilho de palavras-chave**: lista de termos separados por vírgula (ex.: `quero, link, valor, preço, comprar`). Toggle para "match exato" ou "contém".
   - **Modo IA opcional**: além das palavras-chave, também dispara se o Copilot detectar intenção de compra equivalente (reusa `isPurchaseIntent` + classificador leve via Lovable AI).
   - **Resposta pública no comentário** (texto curto, suporta `{{username}}`).
   - **Mensagem no Direct (DM)**:
     - Texto livre com placeholders (`{{username}}`, `{{link}}`).
     - URL do produto/destino → o sistema injeta UTMs automaticamente (`utm_source=instagram`, `utm_medium=comment_to_dm`, `utm_campaign=<slug-da-regra>`, `utm_content=post_<id>`).
     - Opcional: anexar imagem/botão de quick reply (fase 2; texto + link no v1).
   - **Filtros anti-spam**: ignorar comentários do próprio dono, ignorar respostas a comentários (parent_id), cooldown por usuário (default 60s), limite diário por usuário.
   - **Status**: ativa / pausada.
3. Vê a lista de regras com contadores: comentários disparados, DMs entregues, cliques no link curto, conversões atribuídas (reusa `tracked_links` + `link_clicks` + janela de atribuição 72h).
4. Pode editar, pausar, duplicar ou excluir cada regra.

## Como funciona por baixo

- O webhook `instagram-webhook` (ao processar `field=comments` ou `field=live_comments`) consulta as regras ativas da conta e tenta casar:
  1. Filtro de escopo (post específico, todos, lives).
  2. Match de palavra-chave (normaliza acento, lowercase).
  3. Se não bater por palavra mas a regra tiver "Modo IA" ligado, chama um classificador rápido (Gemini Flash) que devolve `match: true/false`.
- Quando casa, registra um log de execução e chama `instagram-send` em modo "rule" passando os textos prontos (sem precisar gerar via Copilot).
- O `instagram-send` ganha um novo modo `rule_reply`:
  - Responde publicamente no comentário com o texto da regra.
  - Encurta o link via `tracked_links` (gera código, salva `rule_id`, `post_id`, `comment_id`).
  - Envia Private Reply (DM) com o texto + link curto rastreável.
  - Loga em `instagram_messages` para aparecer no Atendimento.
- Anti-spam: tabela `instagram_rule_executions` impede disparo duplicado para mesmo `comment_id` e respeita cooldown por `from_ig_user_id`.

## Banco de dados (novas tabelas)

`instagram_comment_rules`
- id, tenant_id, ig_account_id
- name, is_active
- scope (`all` | `posts` | `lives` | `specific`)
- post_ids[] (quando `specific`)
- keywords[] (texto), match_mode (`contains` | `exact`)
- use_ai_intent (bool)
- public_reply_text
- dm_text, dm_link_url
- cooldown_seconds (default 60), daily_limit_per_user (default 3)
- stats_sent, stats_dm_sent, stats_clicks (cache, atualizado por trigger ou cron)
- created_at, updated_at

`instagram_rule_executions`
- id, tenant_id, rule_id, ig_account_id
- comment_id, post_id, from_ig_user_id, from_username
- matched_by (`keyword` | `ai`), matched_term
- public_reply_status, dm_status, dm_message_id, tracked_link_id
- created_at
- índice único em (rule_id, comment_id) para evitar duplicatas

RLS: membros do tenant fazem CRUD; service_role full access.

## Arquivos afetados

**Backend (Edge Functions):**
- `supabase/functions/instagram-webhook/index.ts` — após salvar comentário/live_comment, avaliar regras antes do auto-reply genérico do Copilot. Se uma regra casar, ela tem prioridade e o Copilot genérico não dispara.
- `supabase/functions/instagram-send/index.ts` — adicionar modo `rule_reply` que aceita textos prontos e link, faz comment + private reply + log, sem chamar IA.
- (opcional) `supabase/functions/instagram-rule-match/index.ts` — pequeno helper para classificador IA, chamado só quando `use_ai_intent=true`.

**Frontend:**
- `src/pages/SettingsInstagram.tsx` — adicionar nova aba "Regras Comentário→DM" com lista de regras, modal de criação/edição e métricas.
- `src/components/instagram/CommentRuleEditor.tsx` (novo) — formulário do editor de regra.
- `src/components/instagram/CommentRulesList.tsx` (novo) — lista com toggle ativo/pausado, métricas e ações.
- `src/lib/instagramRules.ts` (novo) — helpers de fetch/create/update das regras via supabase client.

**Migração SQL:**
- Criar as duas tabelas com RLS, índices e índice único de deduplicação.

## Detalhes técnicos relevantes

- Reuso de `tracked_links` já existente (mesmo padrão de UTM/encurtador `wpp.maxapps.com.br/r/:code`).
- Reuso de `instagram_messages` para que o DM disparado pela regra apareça no Atendimento como qualquer outra conversa.
- Atribuição: clicks no link curto gerados pela regra entram no fluxo já existente de atribuição 72h (mem `features/tracking/attribution-logic`).
- Performance: índice em `instagram_comment_rules (ig_account_id, is_active)` para o webhook avaliar rápido.
- Match de palavras: normalização (lowercase + remoção de acentos) tanto no comentário quanto nas keywords.
- Segurança Meta: respeita as mesmas restrições do Private Reply (só pode ser enviado dentro de 7 dias do comentário e exige a permissão `instagram_business_manage_messages` já solicitada).
- O auto-reply genérico do Copilot por comentário continua funcionando como fallback; a regra ganha prioridade quando casa.

## Fora do escopo desta entrega

- Editor visual de fluxos multi-etapas dentro da DM (perguntas, botões com lógica). Esta entrega cobre regra simples: comentou → resposta pública + DM com link. Multi-etapas pode entrar como evolução reusando o `campaign-flow-engine`.
- Envio de mídia (imagem/vídeo) na DM da regra — v2.
