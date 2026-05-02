Identifiquei a causa: o GrapesJS está salvando a imagem como `data:image/...;base64` diretamente dentro do `design` e do `html`. No exemplo atual, só esse pop-up já está com aproximadamente 5,4 MB no JSON e 2,7 MB no HTML. Ao salvar novamente, o banco tenta gravar um payload enorme e gera `canceling statement due to statement timeout`. Além disso, manter base64 no HTML faz o pop-up ficar pesado para carregar no site.

Plano de correção:

1. Criar armazenamento próprio para imagens de pop-up
- Adicionar um bucket público de mídia para pop-ups no Lovable Cloud, por exemplo `popup-assets`.
- Criar políticas seguras: usuários autenticados podem enviar imagens; leitura pública é permitida porque o pop-up publicado precisa exibir a imagem no site externo.
- Organizar arquivos por tenant/pop-up para evitar mistura entre contas.

2. Trocar base64 por URL pública antes de salvar
- No `PopupBuilder.tsx`, antes de chamar `onSave`, varrer o `html`, o `design.assets` e os componentes do `ProjectData` procurando imagens `data:image/...;base64`.
- Converter cada base64 em `Blob/File`, subir para o bucket e substituir o `src` por uma URL pública.
- Só depois salvar `html` e `design`, já sem base64.

3. Ajustar o GrapesJS para upload real de imagens
- Em `GrapesEditor.tsx`, remover a dependência de `embedAsBase64` como solução final.
- Configurar o fluxo de imagens para aceitar seleção/drag-and-drop, mas persistir via URL armazenada, não como base64 no banco.
- Garantir que imagens adicionadas pelo usuário continuem aparecendo ao sair e voltar no editor.

4. Evitar salvamento pesado e retorno pesado após update
- Em `Popups.tsx`, ajustar a mutation para não pedir de volta o registro completo pesado após cada update quando não for necessário.
- Atualizar o estado local com o payload salvo e invalidar a lista em segundo plano.
- Nas listagens, evitar selecionar `design`/`html` quando só precisamos mostrar nome/status/lista, para a tela carregar mais rápido.

5. Higienizar o registro atual afetado
- Para o pop-up que já salvou imagem em base64, ao próximo salvamento/publicação a rotina vai migrar automaticamente a imagem para URL pública e reduzir o tamanho do registro.
- Opcionalmente, se necessário, posso também rodar uma correção pontual para substituir base64 já existente nesse registro.

Arquivos que serão alterados:
- `src/components/templates/GrapesEditor.tsx`
- `src/components/templates/PopupBuilder.tsx`
- `src/pages/Popups.tsx`
- nova migration para criar o armazenamento/políticas de imagens de pop-up

Resultado esperado:
- Imagens inseridas no pop-up serão salvas corretamente.
- O erro `canceling statement due to statement timeout` deve parar.
- Ao sair e voltar, a imagem continua no editor.
- Publicar/salvar fica mais rápido porque o banco salva URLs pequenas, não arquivos base64 gigantes.