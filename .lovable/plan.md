

## Plano: Botão "Limpar Fila" na página de Automação

### Problema
Não existe forma de limpar os itens pendentes na `automation_queue` de uma automação específica. O usuário quer poder escolher entre processar a fila acumulada ou descartá-la e processar apenas novos eventos dali em diante.

### O que será feito

**1. Botão no header da automação** (`src/pages/AutomationDetails.tsx`)
- Adicionar um botão "Limpar fila" ao lado do badge de status no header
- Exibir a contagem de itens pendentes na fila (query na `automation_queue` com `status = 'pending'` e `campaign_id = id`)
- Ao clicar, abrir um `AlertDialog` de confirmação explicando que os itens pendentes serão descartados e apenas novos eventos serão processados
- Após confirmação, marcar todos os itens pendentes como `status = 'skipped'` (ou deletar) via Supabase

**2. Migração de banco** (se necessário)
- Verificar se o status `skipped` já é suportado na `automation_queue`. Se não, não é necessária migração pois o campo `status` é `text` sem constraint — basta usar `'skipped'`

**3. Lógica de limpeza**
- Query: `supabase.from('automation_queue').update({ status: 'skipped', processed_at: new Date().toISOString() }).eq('campaign_id', id).eq('status', 'pending')`
- Toast de sucesso com contagem de itens limpos
- Invalidar queries relacionadas para atualizar a UI

### Detalhes técnicos
- Arquivo editado: `src/pages/AutomationDetails.tsx`
- Imports adicionais: `AlertDialog` components, `Trash2` icon, `useMutation` + `useQueryClient`
- Nova query `automation-queue-count` para exibir pendentes
- Nenhuma migração de banco necessária (campo `status` é `text` livre)

