# Plano: Refatoração Completa da Integração AWS SES

## Diagnóstico do problema atual

A integração já foi migrada para o AWS SDK oficial (`@aws-sdk/client-ses`), portanto o algoritmo de assinatura está **correto**. O erro `SignatureDoesNotMatch` que persiste vem da própria AWS validando as credenciais e indica uma de três causas reais:

1. **Secret Access Key incorreta/truncada** — caractere copiado a menos, espaço extra, ou chave de outra conta. É a causa #1 desse erro quando o SDK oficial está em uso.
2. **Access Key ID e Secret Key de contas/IAM users diferentes** — par incompatível.
3. **Credenciais salvas no banco estão desatualizadas** — o front envia as do formulário, mas em algum fluxo o backend lê do banco/secret antigo.

Além disso, a UX atual não dá feedback claro de qual etapa falhou (credenciais? região? identidade não verificada? permissão IAM?), o que torna impossível para o usuário se autodiagnosticar.

## Objetivo

Reconstruir a integração inteira para que:
- A validação seja **passo a passo** com mensagens específicas (credenciais OK → região OK → identidade verificada OK → permissão de envio OK).
- O envio de teste use **exatamente** as credenciais validadas (sem mistura com banco/secrets antigos).
- Erros da AWS sejam **traduzidos** em português com instruções acionáveis.
- O usuário consiga corrigir sem precisar abrir logs.

---

## Arquitetura

### Edge Function `send-email-ses` (reescrita)

Três modos de operação claros, controlados pelo body:

| Modo | Quando | Faz |
|------|--------|-----|
| `mode: "validate"` | Botão "Validar e Salvar" | 4 chamadas SES sequenciais com diagnóstico granular |
| `mode: "test"` | Botão "Enviar e-mail de teste" | Envia para o e-mail do usuário logado |
| `mode: "send"` | Campanhas/automações reais | Envio em produção lendo credenciais do banco |

**Resolução de credenciais (regra única e explícita):**
- Se `mode = "validate"` ou `"test"` → usa **somente** as credenciais do payload (formulário). Nunca cai pro banco.
- Se `mode = "send"` → usa **somente** as credenciais salvas no banco (`integrations.config`). Nunca aceita do payload.
- Isso elimina a confusão atual onde o front envia credenciais novas mas o backend pode ler antigas.

**Fluxo de validação (4 etapas com feedback individual):**

```text
Etapa 1: GetCallerIdentity (STS)
  → confirma que Access Key + Secret Key formam par válido
  → erro: "Suas credenciais AWS estão incorretas..."

Etapa 2: GetAccount (SES)
  → confirma região correta e conta SES habilitada
  → detecta sandbox vs produção
  → erro: "Região inválida ou SES não habilitado nesta região"

Etapa 3: GetIdentityVerificationAttributes
  → confirma que SENDER_EMAIL está verificado
  → erro: "E-mail X não verificado. Status: Pending. Verifique sua caixa de entrada..."

Etapa 4: GetSendQuota
  → confirma permissão IAM ses:SendEmail (e mostra quota)
  → erro: "IAM user sem permissão ses:SendEmail. Anexe a policy AmazonSESFullAccess"
```

Cada etapa retorna um objeto detalhado:
```json
{
  "validated": true,
  "checks": {
    "credentials": { "ok": true, "account_id": "..." },
    "region": { "ok": true, "region": "sa-east-1", "sandbox": true },
    "identity": { "ok": true, "status": "Success" },
    "quota": { "ok": true, "max_24h": 200, "sent_24h": 5 }
  }
}
```

**Tradução de erros AWS:**
Wrapper que mapeia códigos AWS → mensagens em português:
- `SignatureDoesNotMatch` → "Sua Secret Access Key está incorreta. Copie-a novamente do console IAM."
- `InvalidClientTokenId` → "Access Key ID não existe ou foi desativado."
- `MessageRejected` → "E-mail rejeitado pelo SES (provavelmente sandbox bloqueando destinatário)."
- `MailFromDomainNotVerified` → "Domínio do remetente não verificado."

### Tela `/settings/integrations/aws` (reformulada)

Substitui o card único atual por um **wizard de 3 passos visuais** com indicador de progresso:

```text
[1] Credenciais  →  [2] Validação  →  [3] Teste & Ativar
```

**Passo 1 — Credenciais:**
- Inputs: Access Key ID, Secret Key (com botão "mostrar/ocultar"), Região (select com opções comuns: us-east-1, sa-east-1, eu-west-1...), E-mail remetente.
- Validação client-side: formato AKIA*, comprimento da secret (40 chars), e-mail válido.
- Link "Como obter" → abre dialog com tutorial passo a passo.

**Passo 2 — Validação (executa as 4 etapas):**
- UI mostra checklist em tempo real:
  - ✅ Credenciais válidas (Conta: 123456789012)
  - ✅ Região acessível (sa-east-1, modo Sandbox)
  - ✅ E-mail verificado (marketing@maxfem.com.br)
  - ✅ Permissão de envio (200 e-mails/24h, 5 enviados)
- Se qualquer etapa falhar: mostra ❌ com mensagem específica e botão "Voltar e corrigir".
- Avisos contextuais: se sandbox → alerta amarelo "Você só pode enviar para e-mails verificados. Solicite saída do sandbox no console AWS."

**Passo 3 — Teste & Ativar:**
- Botão "Enviar e-mail de teste" envia para o e-mail do usuário logado.
- Mostra resultado em tempo real (toast + linha na UI com Message-ID).
- Botão "Salvar e Ativar Integração" persiste no banco e marca `is_active = true`.

**Card de status (após ativação):**
- Badge "Ativo" + última validação.
- Botão "Revalidar agora" (re-executa as 4 etapas sem precisar reinserir credenciais — usa as do banco).
- Botão "Reenviar teste".
- Botão "Editar credenciais" → volta ao Passo 1 pré-preenchido (mascarado).
- Botão "Desativar integração" → seta `is_active = false` (não apaga config).

### Persistência

Sem mudanças no schema: continua usando a tabela `integrations` com `provider='aws'`. Adiciona campos no `config` jsonb:
- `last_validated_at`
- `last_validation_checks` (snapshot das 4 etapas)
- `account_id` (para referência)
- `is_sandbox` (bool detectado)

---

## Detalhes Técnicos

### Arquivos afetados

**Backend:**
- `supabase/functions/send-email-ses/index.ts` — reescrita completa
- Adicionar dependência `@aws-sdk/client-sts@3.645.0` para `GetCallerIdentity`

**Frontend:**
- `src/pages/SettingsAWS.tsx` — reescrita completa (wizard de 3 passos)
- Componente novo: `src/components/aws/ValidationChecklist.tsx` — exibe as 4 etapas com ícones de status
- Componente novo: `src/components/aws/AWSCredentialsHelp.tsx` — dialog tutorial

### Comportamento das chamadas SES

```typescript
// Resolução de credenciais — função única, sem fallback cruzado
function resolveCredentials(mode, payload) {
  if (mode === "validate" || mode === "test") {
    // SEMPRE do payload, nunca do banco
    return payload;
  }
  if (mode === "send") {
    // SEMPRE do banco
    return readFromDB();
  }
}
```

### IAM Policy mínima necessária (documentada na UI)

```json
{
  "Effect": "Allow",
  "Action": [
    "ses:SendEmail",
    "ses:SendRawEmail",
    "ses:GetSendQuota",
    "ses:GetIdentityVerificationAttributes",
    "ses:GetAccount",
    "sts:GetCallerIdentity"
  ],
  "Resource": "*"
}
```

### Compatibilidade com EmailMarketing.tsx

O `mode` default (sem o campo) será `"send"` para manter retrocompatibilidade com chamadas existentes do módulo de E-mail Marketing.

---

## Resultado esperado

Ao final, o usuário:
1. Cola credenciais → vê em 5 segundos exatamente o que está errado (se algo estiver).
2. Recebe e-mail de teste no próprio inbox antes de ativar.
3. Tem botão de revalidação para diagnosticar problemas futuros sem reinserir nada.
4. Nunca mais vê a mensagem genérica "SignatureDoesNotMatch" — sempre uma mensagem em português acionável.

Após sua aprovação, executo a refatoração e faço o deploy da edge function.