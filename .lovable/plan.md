
Objetivo: destravar a conexão do Instagram e eliminar o erro recorrente “ID do app inválido” com diagnóstico explícito no próprio sistema.

1. Confirmar o ponto exato da falha no fluxo
- O erro atual acontece antes do callback OAuth finalizar.
- O caminho afetado é: `/settings/instagram` → `instagram-register?action=start` → URL `https://www.facebook.com/v22.0/dialog/oauth`.
- Como a tela da Meta ainda mostra “ID do app inválido”, o problema está no `client_id` enviado pelo backend, não em tabelas, webhooks ou RLS.

2. Fortalecer a Edge Function `instagram-register`
- Validar `META_APP_ID` logo no início do `action=start`.
- Aplicar normalização defensiva no valor (`trim`) para evitar espaços/quebras de linha.
- Se o App ID estiver vazio ou não for numérico, retornar erro claro e específico, por exemplo:
  - `META_APP_ID ausente`
  - `META_APP_ID inválido: precisa ser numérico`
- Incluir um modo de diagnóstico autenticado no retorno do `start` com dados não sensíveis:
  - `meta_app_id`
  - `meta_app_id_length`
  - `meta_app_id_is_numeric`
  - `redirect_uri`
- Melhorar logs do `start` para registrar apenas metadados seguros do OAuth gerado.

3. Melhorar o frontend de `/settings/instagram`
- Tratar separadamente erro de “início da conexão” vs erro de “callback”.
- Quando o backend indicar configuração inválida, mostrar mensagem explícita na tela informando que o App ID runtime do backend não bate com o esperado.
- Adicionar uma área de diagnóstico visível apenas nessa tela com:
  - App ID que o backend está usando
  - redirect URI enviado
  - checklist de validação rápida da Meta
- Manter o comportamento de abrir nova aba no preview, mas com feedback melhor se a URL vier inválida.

4. Revalidar a configuração real em runtime
- Testar o `action=start` e conferir se a URL OAuth gerada contém `client_id=877027558735996`.
- Se o valor retornado for diferente, regravar `META_APP_ID` e `META_APP_SECRET` no backend e validar novamente.
- Se o valor estiver correto, seguir para o próximo erro real da Meta em vez de continuar preso no falso diagnóstico inicial.

5. Teste final da integração
- Clicar em “Conectar Instagram”.
- Confirmar abertura da autorização da Meta sem erro de App ID.
- Concluir o callback e validar:
  - toast de sucesso com número de contas conectadas
  - inserção/atualização em `instagram_accounts`
  - listagem das contas sincronizadas na página

Detalhes técnicos
- Arquivos principais:
  - `supabase/functions/instagram-register/index.ts`
  - `src/pages/SettingsInstagram.tsx`
- Não deve exigir migração de banco.
- O indício mais forte hoje é discrepância entre o App ID esperado (`877027558735996`) e o App ID efetivamente usado em runtime pela função.
- A correção proposta resolve o problema atual e evita novos ciclos cegos de tentativa/erro na configuração OAuth.
