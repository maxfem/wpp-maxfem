

## Status da integração Instagram

### ✅ Já configurado
- **App Meta** "maxzap" criado, App ID `877027558735996` e Secret válidos (já salvos em `META_APP_ID` / `META_APP_SECRET`).
- **3 URIs de redirecionamento OAuth** cadastradas no painel Meta (preview, lovable.app e maxapps.com.br).
- **Login OAuth Web + HTTPS + modo estrito** ativados.
- **Edge Functions** prontas: `instagram-register` (start/callback), `instagram-webhook` (DMs/comments/lives), `instagram-send`.
- **Frontend** `/settings/instagram` com fluxo de conexão, abertura em nova aba (preview), refresh automático no retorno e gestão de auto-reply (DMs / comentários / lives).
- **Tabelas** `instagram_accounts`, `instagram_messages`, `instagram_comments`, `instagram_live_comments` com RLS por tenant.

### ⚠️ O que ainda falta no painel Meta para conectar

**1. Adicionar os produtos certos ao app**
No app maxzap → "Adicionar produto", certifique-se de ter:
- **Login do Facebook para empresas** ✅ (já está)
- **Webhooks** — para receber DMs/comentários
- **Instagram Graph API** — para enviar mensagens e ler dados

**2. Permissões / escopos solicitados**
O `instagram-register` pede estes escopos. Eles precisam estar disponíveis no app:
- `instagram_basic`
- `instagram_manage_messages`
- `instagram_manage_comments`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_show_list`
- `business_management`

Em **App Review → Permissões e Recursos**, confirme que estão listados. Em **modo Desenvolvimento**, funcionam só para usuários adicionados como Admin/Dev/Tester. Para produção pública, precisam ser **aprovados em App Review**.

**3. Cadastrar você como tester (modo Dev)**
Em **Funções do app → Funções**, adicione seu usuário Facebook como **Administrador** ou **Testador**. Sem isso, mesmo os escopos básicos retornam erro de permissão.

**4. Configurar o Webhook do Instagram**
Em **Produtos → Webhooks → Instagram**:
- **Callback URL**: `https://poukhwsbskcvwroeqoct.supabase.co/functions/v1/instagram-webhook`
- **Verify Token**: o mesmo valor já salvo em `WHATSAPP_VERIFY_TOKEN` (a função reaproveita esse secret)
- Subscrever os campos: `messages`, `messaging_postbacks`, `comments`, `live_comments`, `mentions`

**5. Pré-requisitos da própria conta IG**
- Conta Instagram deve ser **Business ou Creator** (não pessoal).
- Deve estar **vinculada a uma Página do Facebook** que você administre.
- Você precisa ser admin tanto da Página quanto do app.

### 🧪 Próximo teste
Após (1)–(5), clique em **Conectar Instagram**. A nova aba abrirá a tela de autorização do Facebook listando as permissões. Aprove → você volta para `/settings/instagram` → o toast mostrará "X conta(s) conectada(s)".

Se aparecer erro nesse passo, me envie o print/JSON da tela final e eu identifico exatamente qual etapa acima está faltando — não há mais nada do lado do código pendente.

