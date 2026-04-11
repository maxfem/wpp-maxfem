

# Integração OpenAI para Assistente de Atendimento

## Visão Geral
Adicionar OpenAI como integração em `/settings/integrations/openai`, onde o usuário configura API Key, tom, nível de inteligência (modelo) e prompt do agente. Na aba Copilot do chat, transformar em assistente funcional com toggle de ativar/desativar por conversa e opções específicas por conversa.

## Passo 1 — Migração SQL
Adicionar colunas na tabela `integrations` para armazenar configurações de IA:
```sql
-- A config jsonb já existe na tabela integrations, vamos usar para:
-- config.openai_api_key (encriptado no futuro)
-- config.tone (formal, informal, neutro)  
-- config.model (gpt-4o-mini, gpt-4o, gpt-4-turbo)
-- config.system_prompt (texto livre)
-- config.ai_enabled (boolean global)
```
Nenhuma migração necessária — a coluna `config` jsonb já existe.

## Passo 2 — Página de Configuração OpenAI (`src/pages/SettingsOpenAI.tsx`)
Nova página seguindo o padrão do SettingsYampi:
- Campo de API Key (com toggle de visibilidade)
- Seletor de Tom: Formal, Informal, Amigável, Técnico
- Seletor de Modelo: gpt-4o-mini (econômico), gpt-4o (balanceado), gpt-4-turbo (avançado)
- Textarea para prompt do sistema (instruções da agente)
- Botão Salvar que persiste tudo em `integrations` com `provider = 'openai'`
- Botão Testar conexão (chama a API para validar a key)

## Passo 3 — Adicionar OpenAI na lista de integrações
Em `SettingsIntegrations.tsx`, adicionar card da OpenAI no array PROVIDERS:
- Nome: OpenAI
- Cor: #10A37F
- Features: ["Assistente IA", "Sugestão de Respostas", "Copilot"]

## Passo 4 — Rota no App.tsx
```
/settings/integrations/openai → SettingsOpenAI
```

## Passo 5 — Edge Function `ai-copilot`
Nova edge function que:
- Recebe: mensagens da conversa, tenant_id, configurações opcionais por conversa
- Busca config da OpenAI na tabela `integrations`
- Chama a API da OpenAI com o prompt do sistema + histórico
- Retorna sugestão de resposta

## Passo 6 — Tab Copilot funcional (`ContactInfoPanel.tsx`)
Substituir o placeholder "Em breve" por:
- **Toggle Ativar/Desativar IA** nesta conversa (estado local, persistido em `custom_attributes` do customer)
- **Seletor de tom** por conversa (override do global)
- **Campo de contexto** específico da conversa (ex: "cliente VIP, priorizar")
- **Botão "Sugerir resposta"** que chama a edge function e mostra a sugestão
- **Botão "Copiar"** para colar a sugestão no input
- Indicador de status da integração (configurada/não configurada)

## Arquivos
- **Nova migração**: nenhuma (usa `config` jsonb existente)
- **`src/pages/SettingsOpenAI.tsx`** — nova página de configuração
- **`src/pages/SettingsIntegrations.tsx`** — adicionar card OpenAI
- **`src/App.tsx`** — nova rota
- **`supabase/functions/ai-copilot/index.ts`** — edge function
- **`src/components/chat/ContactInfoPanel.tsx`** — tab Copilot funcional

