

# Validação Completa de Templates Antes do Envio à Meta

## Contexto

Atualmente, o sistema valida apenas 3 regras antes de enviar o template à Meta (corpo vazio, variáveis nas bordas, URL de botão inválida). Erros da Meta (subcodes 2388xxx) são tratados reactivamente na edge function. O objetivo é mapear **todas** as regras da documentação oficial e validar **antes** de submeter, dando feedback claro ao usuário.

## Regras Mapeadas da Documentação Meta

Com base na documentação oficial (Graph API v22-25, error codes page, components page):

### Limites de Caracteres (error 2388040)
| Campo | Máximo |
|-------|--------|
| Template name | Apenas lowercase, underscore, números. Máx 512 chars |
| Header (text) | 60 caracteres |
| Body | 1024 caracteres |
| Footer | 60 caracteres |
| Botão label (todos tipos) | 25 caracteres |
| Botão URL | 2000 caracteres |
| Botão phone_number | 20 caracteres |
| COPY_CODE example | 15 caracteres |

### Formatação do Header (error 2388047)
- Sem emojis, markdown (*_~), quebras de linha
- Máximo 1 variável no header texto
- Header de mídia (image/video/document) requer `header_handle`

### Formatação do Body (error 2388072)
- Variáveis devem ser sequenciais: {{1}}, {{2}}, {{3}}...
- Não pode ter variáveis duplicadas ou fora de ordem

### Formatação do Footer (error 2388073)
- Sem variáveis, sem formatação markdown, sem emojis

### Proporção de Variáveis (error 2388293)
- Variáveis não podem dominar o texto; precisa ter conteúdo fixo significativo
- Regra prática: texto fixo deve ter mais palavras que variáveis

### Variáveis nas Bordas (error 2388299)
- Variável não pode ser o primeiro ou último elemento do body (já validado)

### Regras de Botões
- Máx 10 botões no total
- Máx 2 botões URL
- Máx 1 botão PHONE_NUMBER
- Máx 1 botão COPY_CODE
- Máx 10 QUICK_REPLY
- Quick reply deve ser agrupado junto (não intercalar com outros tipos)
- URL com variável deve usar `{{1}}` e ter `example`

### Template Name
- Apenas letras minúsculas, números e underscore
- Não pode começar com número

### Outros Erros de Criação (tratados na resposta)
- 2388023: Idioma em processo de exclusão (4 semanas)
- 2388024: Template já existe com mesmo nome+idioma
- 2388019: Limite de 250 templates na WABA
- 80008: Rate limit (100 templates/hora)

## Plano de Implementação

### 1. Criar função de validação compartilhada

Adicionar uma função `validateTemplate(form)` em `src/pages/MessageTemplates.tsx` que retorna um array de erros com `field` e `message`. Executar no `onSubmit` do formulário de criação/edição (salvar rascunho) e no botão de envio à Meta.

Validações client-side (antes de salvar):
- Nome: regex `/^[a-z][a-z0-9_]*$/`, máx 512
- Header text: máx 60 chars, máx 1 variável, sem emoji/markdown
- Body: obrigatório, máx 1024 chars, variáveis sequenciais, sem variáveis nas bordas
- Footer: máx 60 chars, sem variáveis, sem emoji
- Botão labels: máx 25 chars cada
- Botão URL: máx 2000 chars, deve começar com https://
- Botão phone: máx 20 chars
- COPY_CODE: máx 15 chars no example
- Máx 10 botões, máx 2 URL, máx 1 phone, máx 1 copy_code
- Quick reply agrupamento válido
- Proporção variáveis vs texto fixo

### 2. Validação visual no formulário

Mostrar erros inline abaixo de cada campo com texto vermelho. Bloquear o botão "Salvar" se houver erros críticos. Mostrar contadores de caracteres nos campos (60/60, 1024/1024).

### 3. Reforçar validação na Edge Function

Adicionar os mesmos checks no `whatsapp-template/index.ts` como segunda camada de segurança, e mapear os subcodes restantes (2388040, 2388047, 2388073, 2388293, 80008, 2388019) com mensagens em português.

### 4. Sample values obrigatórios

Se o body/header tem variáveis, exigir `sample_values` preenchidos antes de permitir envio à Meta.

## Arquivos Modificados

- `src/pages/MessageTemplates.tsx` — função `validateTemplate()`, contadores de chars, erros inline, bloqueio de submit
- `supabase/functions/whatsapp-template/index.ts` — validações server-side adicionais + mapeamento completo de subcodes

