

# Separar Campanhas e Automações

## Problema Atual
Tudo está na mesma tabela `campaigns`. Ambas as páginas (Campanhas e Automações) consultam a mesma tabela sem filtro, mostrando os mesmos registros. Não há distinção clara no banco entre um disparo pontual agendado (campanha) e uma régua acionada por evento (automação).

## Solução

### 1. Migração SQL — Adicionar coluna `kind`
Adicionar uma coluna `kind` na tabela `campaigns` com valores `campaign` ou `automation`:

```sql
ALTER TABLE campaigns ADD COLUMN kind TEXT NOT NULL DEFAULT 'campaign';
-- Marcar registros existentes que têm trigger_type como automações
UPDATE campaigns SET kind = 'automation' WHERE trigger_type IS NOT NULL;
```

### 2. Página Campanhas (`Campaigns.tsx`)
- Filtrar query: `.eq("kind", "campaign")`
- Criar campanha sempre com `kind: "campaign"`, sem `trigger_type`
- Toggle alterna entre `draft` e `scheduled` (agendar envio)
- Status possíveis: draft, scheduled, sending, sent, failed, finished
- Remover referências a automações

### 3. Página Automações (`Automations.tsx`)
- Filtrar query: `.eq("kind", "automation")`
- Criar automação sempre com `kind: "automation"`, com `trigger_type` obrigatório
- Toggle alterna entre `draft` e `running` (ativar/desativar)
- Status possíveis: draft, running, paused
- StatusConfig próprio com labels adequados: "Inativa" (draft), "Ativa" (running)

### 4. Campaign Executor (`campaign-executor`)
- Campanhas: processar quando `kind = 'campaign'` AND `status = 'scheduled'` AND `scheduled_at <= now()`
- Automações: processar via `automation_queue` quando `kind = 'automation'` AND `status = 'running'`

### 5. Activities filtradas por kind
- Query de `campaign_activities` em cada página filtra apenas pelos IDs de campanhas/automações do respectivo `kind`

## Arquivos Alterados
- **Migração SQL** — coluna `kind` + update dos existentes
- **`src/pages/Campaigns.tsx`** — filtro `.eq("kind", "campaign")`, toggle → scheduled/draft
- **`src/pages/Automations.tsx`** — filtro `.eq("kind", "automation")`, toggle → running/draft, status labels próprios
- **`supabase/functions/campaign-executor/index.ts`** — filtro por `kind` nas queries

