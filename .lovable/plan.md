## Diagnóstico

Encontrei **3 problemas críticos** na integração atual:

### 1. Credenciais não salvas no banco (causa raiz do "send" nunca funcionar)
A configuração ativa em `integrations` (provider=`aws`) contém **apenas** `sender_email`:
```
{ sender_email: "marketing@maxfem.com.br", updated_at: "..." }
```
Faltam `access_key`, `secret_key` e `region`. O modo `send` (usado por campanhas/EmailMarketing) lê do banco e falha silenciosamente. Apenas o modo `test` funciona porque recebe credenciais direto do formulário.

### 2. Erro `SignatureDoesNotMatch` no teste
A Secret Access Key digitada no formulário está incorreta (espaço, caractere faltando ou key antiga). A AWS valida assinatura HMAC-SHA256 e rejeita.

### 3. Arquitetura insegura e confusa
Hoje as credenciais ficam:
- No formulário do usuário (digitadas toda vez)
- No banco em texto plano (quando salvas)
- E também existem como secrets do projeto (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)

Três fontes da verdade = bugs garantidos. A produção exige uma única fonte confiável.

---

## Solução proposta

### Mudança arquitetural
Passar a usar **exclusivamente os secrets do projeto** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) como fonte única para credenciais. Isso é mais seguro (nada em texto plano no banco), elimina divergência entre formulário/banco/secrets, e funciona automaticamente para qualquer chamada (campanhas, automações, testes).

O banco passa a guardar apenas:
- `sender_email` (qual remetente verificado usar)
- `is_active` (liga/desliga)
- `last_validated_at` + `last_validation_checks` (auditoria)

### Passo a passo

**1. Reescrever `send-email-ses` edge function**
- Sempre ler `accessKeyId`, `secretAccessKey`, `region` de `Deno.env.get(...)`
- Validar presença dos 3 secrets na entrada — se faltar, retornar erro claro
- 3 modos: `validate`, `test`, `send`
  - `validate`: STS GetCallerIdentity + GetSendQuota + verificar identidade do `senderEmail` enviado
  - `test`: envia e-mail de teste para destinatário fornecido
  - `send`: lê `sender_email` do banco e envia (usado por campanhas)
- Detectar Sandbox via `Max24HourSend === 200`
- Logging estruturado para debug em produção

**2. Reescrever página `SettingsAWS.tsx`**
- Remover campos de Access Key e Secret Key do formulário
- Mostrar status dos secrets: "AWS_ACCESS_KEY_ID configurado ✓" / "Não configurado ✗"
- Se faltar secret, mostrar instrução clara de como adicionar via Lovable
- Manter apenas: select de Região (apenas exibe `AWS_REGION` atual) + input de E-mail Remetente
- Botão "Validar conexão" → chama modo `validate`
- Botão "Enviar e-mail de teste" → chama modo `test` para o e-mail do usuário logado
- Botão "Salvar e ativar" → grava só `sender_email` + `is_active=true`
- Mostrar Sandbox/Produção baseado na quota retornada

**3. Atualizar/garantir secrets**
- Confirmar que `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_REGION` estão preenchidos com valores corretos. Se a Secret Key atual está dando `SignatureDoesNotMatch`, pedir nova key gerada no IAM (40 caracteres exatos, sem espaços).

**4. Atualizar `EmailMarketing.tsx`**
- Garantir que continua chamando modo `send` sem passar credenciais (já está correto)
- Validar que se a integração estiver inativa, exibe aviso para o usuário

**5. Migrar config existente no banco**
- Limpar `access_key`/`secret_key` do `integrations.config` (caso existam) por segurança
- Manter `sender_email` e `is_active`

---

## Detalhes técnicos

**Edge function — mudança chave:**
```ts
async function resolveCredentials(payload) {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim();
  const region = Deno.env.get("AWS_REGION")?.trim() || "us-east-1";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Secrets AWS não configurados no projeto.");
  }
  // senderEmail vem do payload (validate/test) ou do banco (send)
  ...
}
```

**Banco — limpar campos sensíveis:**
```sql
UPDATE integrations
SET config = jsonb_build_object(
  'sender_email', config->>'sender_email',
  'updated_at', now()
)
WHERE provider = 'aws';
```

**Secret check no front:**
Adicionar endpoint `mode: "status"` que retorna `{ has_access_key: bool, has_secret_key: bool, region: string }` (sem expor valores) para a UI mostrar o estado.

---

## Resultado esperado

- ✅ Campanhas e EmailMarketing enviam e-mails sem erro
- ✅ Sem credenciais em texto plano no banco
- ✅ Uma única fonte da verdade (secrets do projeto)
- ✅ Erros claros se algo falhar (secret faltando, identidade não verificada, sandbox, etc.)
- ✅ Validação completa (STS + identidade + quota) antes de ativar
- ✅ Detecção automática de Sandbox vs Produção

Após sua aprovação, vou implementar tudo e te pedir para confirmar os valores corretos da Access Key e Secret Key (caso a atual esteja gerando `SignatureDoesNotMatch`).
