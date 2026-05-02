Vou corrigir o fluxo do editor de pop-up separando claramente três ações: salvar rascunho, publicar e ativar/desativar.

Plano:

1. Criar um exportador único e confiável do GrapesJS
- Centralizar a leitura do editor atual (`getHtml`, `getCss`, `getProjectData`).
- Remover dependência frágil de `window.grapesEditor` quando possível, expondo a instância do GrapesJS do componente filho para o `PopupBuilder` via callback/ref.
- Garantir que o conteúdo em edição seja finalizado antes de salvar, incluindo texto que ainda está em modo de edição.
- Manter CSS + HTML juntos para renderização do pop-up publicado.

2. Adicionar botão de “Salvamento rápido”
- Incluir um botão separado no topo do editor: “Salvar”.
- Esse botão salvará design, HTML e configurações sem alterar o status ativo/inativo do pop-up.
- Exibir feedback claro: “Alterações salvas”.

3. Corrigir o botão “Publicar Pop-up”
- O botão “Publicar Pop-up” passará a salvar o conteúdo e também marcar o pop-up como ativo.
- Depois que o pop-up já estiver publicado/ativo, o botão ficará com comportamento/texto de salvamento normal, conforme solicitado: após publicar, somente salvar.
- O estado local `editingPopup` será atualizado imediatamente após o retorno do banco para evitar que, ao sair e voltar, pareça que as mudanças desapareceram.

4. Adicionar controle de ativar/desativar dentro do editor
- Além do status na lista, colocar um botão/switch no cabeçalho do editor para “Ativar” e “Desativar”.
- Ao desativar, manter o design salvo, mas impedir que o script público exiba o pop-up.
- Ao ativar, atualizar `is_active` sem perder alterações do editor.

5. Ajustar as mutations em `Popups.tsx`
- Separar mutation de salvar conteúdo/configurações da mutation de status quando fizer sentido.
- Permitir que o salvamento receba opcionalmente `is_active` para o fluxo de publicação.
- Retornar sempre o registro atualizado com `select().single()` e atualizar `editingPopup` imediatamente.

6. Melhorar proteção contra perda de alterações
- Marcar o editor como “com alterações não salvas” quando houver mudança no GrapesJS ou nas configurações.
- Desabilitar/mostrar loading corretamente durante salvamento/publicação.
- Opcionalmente mostrar aviso visual simples “alterações não salvas” no cabeçalho.

Arquivos principais que serão alterados:
- `src/components/templates/GrapesEditor.tsx`
- `src/components/templates/PopupBuilder.tsx`
- `src/pages/Popups.tsx`

Resultado esperado:
- O botão “Salvar” grava rapidamente sem publicar.
- “Publicar Pop-up” salva e ativa o pop-up na primeira publicação.
- Depois de publicado, o fluxo vira apenas salvar alterações.
- Ativar/desativar funciona dentro do editor e na lista.
- Ao sair e voltar para o editor, as modificações continuam aparecendo.