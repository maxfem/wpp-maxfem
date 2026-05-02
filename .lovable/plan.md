## Diagnóstico

Existem 3 problemas diferentes, todos causando confusão entre o que o usuário vê no editor e o que aparece no site:

**1. Pop-up no site está mostrando o "fallback" genérico ("Fique por dentro / Quero receber"), não o "E-com GPT".**

Causa: o script `popup-manager` tem uma rotina de auto-fallback que substitui o HTML salvo por um pop-up genérico se ele for considerado "quebrado" ou vazio. Combinado com:

- Quando o pop-up "E-com GPT" foi criado, o `html_mobile` ficou com o template antigo "Título do seu Pop-up" (verificado no banco: 911 bytes do template default), porque a função de criar pop-up só preenche `html`, não `html_mobile`.
- Em viewport mobile, o script pega `html_mobile` (template antigo) ou cai no fallback genérico.
- O cache do CDN/script no site da loja também pode estar segurando uma versão antiga.

**2. Não dá para ver o mesmo conteúdo no Desktop e Mobile primeiro.**

Hoje, ao alternar para Mobile no editor, se a versão mobile estiver vazia o editor abre em branco. O usuário quer começar com o **mesmo design do desktop espelhado para mobile**, e só depois ajustar o que precisa.

**3. Não tem como editar o HTML cru do pop-up.**

O usuário quer um botão "Editar HTML" para colar / ajustar o HTML diretamente, tanto no Desktop quanto no Mobile.

Bônus: erros de runtime `Cannot read properties of undefined (reading 'lastComponent' / 'allComponents')` no GrapesEditor — causados por `loadProjectData` ser chamado num editor que ainda está montando ao trocar de modo (devido ao `key={previewMode}` que força remount).

---

## Plano de correção

### 1. Garantir que o site mostre o pop-up real (não o fallback)

- **Backfill no banco**: para todos os pop-ups onde `html_mobile` está vazio ou ainda é o template default antigo ("Título do seu Pop-up"), copiar o conteúdo de `html` para `html_mobile`. Assim, em mobile, o pop-up sempre mostra o mesmo design do desktop por padrão.
- **Ajustar a criação de pop-up** (`Popups.tsx`): ao criar um pop-up novo a partir de um template, gravar o mesmo HTML em `html` e `html_mobile`, e o mesmo `design` em `design` e `design_mobile`. Se o template tiver versão mobile específica, usar ela; senão, espelhar.
- **Tornar o "fallback" do `popup-manager` mais conservador**: hoje ele troca por um pop-up genérico se o HTML não casar com um regex restrito. Vou afrouxar essa detecção (só usar fallback se o HTML for realmente vazio) e, em caso de fallback, logar no console do site para o usuário conseguir identificar.
- **Cache-bust**: o script já manda `Cache-Control: no-store`, mas a tag `<script src=...>` no site pode estar sendo cacheada pelo navegador/CDN. Vou adicionar um parâmetro de versão automático (`?v=` baseado em `updated_at`) na instrução de instalação, e também passar a expor o `updated_at` do pop-up no início do script (em comentário) pra ficar fácil verificar qual versão está rodando.

### 2. Espelhar Desktop → Mobile no editor

- No `PopupBuilder`, quando o usuário clicar em "Mobile" pela primeira vez (sem `html_mobile` salvo), carregar automaticamente o conteúdo atual do Desktop como ponto de partida.
- Adicionar um botão "Copiar do Desktop" no modo Mobile para regravar a versão mobile com o conteúdo desktop atual a qualquer momento.
- Ao salvar, garantir que se o `html_mobile` ainda estiver vazio, ele seja preenchido com o `html` do desktop (defesa em profundidade).

### 3. Editor de HTML cru

- Adicionar um botão "Editar HTML" no toolbar do `PopupBuilder` (ao lado de Desktop/Mobile/Configurações).
- Abre um diálogo (`Dialog`) com um `Textarea` grande contendo o HTML atual do modo selecionado (Desktop ou Mobile).
- Ao clicar em "Aplicar", recarregar o GrapesJS com esse HTML (`editor.setComponents(html)`), respeitando o modo atual.
- Validação simples: rejeitar se o HTML estiver vazio ou só com tags `<html>/<head>/<body>` sem conteúdo.

### 4. Estabilizar o GrapesEditor ao trocar de modo

- Remover o `key={previewMode}` que causa remount completo do editor.
- Em vez disso, usar `editor.setDevice()` para a troca visual e `editor.loadProjectData()`/`setComponents()` apenas após confirmar que o editor está pronto (verificar `editor.Components` existe antes de chamar).
- Envolver as chamadas de troca de modo em try/catch para não travar a UI quando o editor estiver no meio de uma renderização.

### 5. UX: mostrar o que está publicado

- No card do pop-up listado em `/popups`, mostrar a data do último update (`updated_at`) e um botão "Ver script atual" que carrega o conteúdo do endpoint `popup-manager/script?id=...` numa janela de inspeção, para o usuário comparar com o que está no site.

---

## Detalhes técnicos

**Arquivos que serão alterados:**

- `supabase/functions/popup-manager/index.ts` — afrouxar regex de detecção de "broken", adicionar log/comentário com `updated_at`.
- `src/components/templates/PopupBuilder.tsx` — espelhar Desktop→Mobile na primeira visita, botão "Copiar do Desktop", botão e diálogo "Editar HTML", remover `key` que força remount, garantir `html_mobile` no `onSave`.
- `src/pages/Popups.tsx` — ao criar pop-up, gravar `html_mobile`/`design_mobile` espelhando o desktop; mostrar `updated_at` na listagem.
- Nova migration — backfill: `UPDATE popups SET html_mobile = html, design_mobile = design WHERE html_mobile IS NULL OR length(html_mobile) < 100 OR html_mobile ILIKE '%Título do seu Pop-up%'`.

**Resultado esperado:**

- O pop-up exibido em maxfem.com.br passa a ser o mesmo do editor, em desktop e mobile.
- Ao abrir um pop-up novo no editor, Desktop e Mobile já mostram o mesmo design (espelhado), e o usuário ajusta o mobile depois se quiser.
- Botão "Editar HTML" permite colar/ajustar o HTML cru a qualquer momento, separado por Desktop/Mobile.
- Erros `lastComponent` / `allComponents` somem ao trocar de modo.
