

## Diagnóstico

O problema é que a **Meta não está enviando POSTs** para o webhook. Os logs mostram apenas verificações GET e shutdowns — nenhum POST de mensagem inbound foi recebido. Isso significa que o campo "messages" no painel da Meta **não está subscrito** corretamente, ou a URL/token ainda não foram salvos com sucesso.

Porém, além de resolver esse bloqueio de configuração na Meta (que depende do usuário), o código atual tem fragilidades estruturais que impedem o funcionamento robusto do inbound. Vou corrigi-las todas de uma vez, preparando para multi-número.

## Problemas identificados no código

1. **Webhook não tem logging de diagnóstico no POST** — erros silenciosos dificultam debug
2. **Tenant é resolvido por "primeiro tenant" em vez de pelo phone_number_id** — não escala para multi-número
3. **Busca de customer por phone falha com variações de formato** — o webhook recebe `5521978363113` mas o customer pode ter `+5521978363113` ou `21978363113`
4. **Não há tabela de mapeamento phone_number_id → tenant** — necessária para multi-número
5. **A tela de Chat não mostra o nome do customer quando o phone tem formato diferente** — a resolução de nome usa match exato por phone

## Plano de implementação

### 1. Criar tabela `whatsapp_accounts` para mapeamento multi-número

Nova tabela para vincular cada phone_number_id da Meta a um tenant:

```sql
CREATE TABLE public.whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone TEXT,
  verified_name TEXT,
  quality_rating TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Com RLS adequada (tenant members podem ver/gerenciar, service_role acesso total).

### 2. Reescrever `whatsapp-webhook/index.ts`

- Resolver tenant via `whatsapp_accounts.phone_number_id` em vez de "primeiro tenant"
- Normalizar phones antes de buscar customers (remover `+`, comparar variações)
- Adicionar logging detalhado em cada etapa (body recebido, customer encontrado, mensagem salva)
- Tratar erros de insert com logging explícito

### 3. Atualizar `whatsapp-send/index.ts`

- Buscar `phone_number_id` e `access_token` da tabela `whatsapp_accounts` por tenant, em vez de usar env var global (preparação multi-número)
- Fallback para env var `WHATSAPP_PHONE_NUMBER_ID` enquanto não há registro na tabela

### 4. Atualizar `whatsapp-register/index.ts`

- Após registro bem-sucedido, inserir/atualizar registro em `whatsapp_accounts` vinculando o `WHATSAPP_PHONE_NUMBER_ID` ao tenant do usuário

### 5. Atualizar tela de Chat (`src/pages/Chat.tsx`)

- Normalizar phones ao fazer match com customers para resolução de nomes
- Adicionar indicador visual de conexão do webhook (online/offline)

### 6. Seed inicial da tabela `whatsapp_accounts`

Inserir o mapeamento atual:
- `phone_number_id`: `987940634413710`
- `tenant_id`: (tenant existente do usuário)

### 7. Atualizar `SettingsWhatsApp.tsx`

- Mostrar os números cadastrados em `whatsapp_accounts`
- Permitir adicionar novo número com phone_number_id

---

### Detalhes técnicos

**Normalização de phone**: função utilitária que remove `+` e espaços, e compara as últimas 10-11 digits para match brasileiro.

**Webhook logging**: cada POST receberá um `console.log` com o body completo truncado, e cada etapa (find customer, create customer, save message) terá log de sucesso/erro.

**Fallback de tenant**: se `whatsapp_accounts` não tiver o phone_number_id, faz fallback para o primeiro tenant (compatibilidade retroativa), mas loga um warning.

