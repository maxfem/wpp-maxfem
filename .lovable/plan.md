

# Plano: Integrar Gemini no Atendimento (Imagem, Vídeo e Áudio)

## Situação Atual

O copilot do chat usa **OpenAI** com chave do usuário. Imagens são enviadas via Vision, mas **vídeo e áudio são apenas mencionados como texto** — o modelo não os processa de fato.

## O Que Muda

Adicionar **Gemini** como provedor de IA alternativo (via Lovable AI Gateway, sem necessidade de API key). O Gemini tem suporte nativo a multimodal: imagem, vídeo e áudio. O usuário escolhe o provedor na página de integrações.

---

## Etapas

### 1. Nova página de configuração: Gemini Integration

Criar `src/pages/SettingsGemini.tsx` seguindo o padrão do `SettingsOpenAI.tsx`:
- Sem campo de API Key (usa Lovable AI Gateway automaticamente)
- Seleção de modelo: `gemini-2.5-flash` (padrão), `gemini-2.5-pro`
- Tom de voz e prompt do sistema (mesmos campos do OpenAI)
- Salva na tabela `integrations` com `provider: "gemini"`

### 2. Adicionar Gemini no catálogo de integrações

Atualizar `SettingsIntegrations.tsx`: adicionar entrada "Gemini" no array `PROVIDERS` com cor, features (Imagem, Vídeo, Áudio, Copilot), link para `/settings/integrations/gemini`.

### 3. Adicionar rota

Registrar `/settings/integrations/gemini` no `App.tsx` apontando para `SettingsGemini`.

### 4. Atualizar Edge Function `ai-copilot`

Modificar `supabase/functions/ai-copilot/index.ts`:
- Verificar se existe integração `gemini` ativa para o tenant (prioridade sobre OpenAI)
- Se Gemini ativo: chamar `https://ai.gateway.lovable.dev/v1/chat/completions` com `LOVABLE_API_KEY`
- Para **imagens**: enviar como `image_url` no formato multimodal (já suportado pelo gateway)
- Para **áudio**: baixar o arquivo do storage, converter para base64, enviar como `input_audio` no payload
- Para **vídeo**: baixar, converter para base64, enviar como conteúdo multimodal
- Manter fallback para OpenAI se Gemini não estiver configurado
- Manter todas as tools existentes (lookup_orders_by_cpf, lookup_orders_bling)

### 5. Transcrição de áudio real

Quando um áudio é recebido no chat e o Gemini está ativo:
- O copilot envia o áudio como conteúdo multimodal para o Gemini
- O Gemini transcreve e interpreta o áudio nativamente
- A sugestão de resposta considera o conteúdo do áudio

---

## Detalhes Técnicos

**Formato multimodal para Gemini via gateway:**
```typescript
// Imagem
{ type: "image_url", image_url: { url: signedUrl } }

// Áudio (base64)
{ type: "input_audio", input_audio: { data: base64, format: "mp3" } }
```

**Prioridade de provedor:** Gemini > OpenAI. Se ambos estiverem ativos, usa Gemini.

**Sem custo de API key para o usuário:** Gemini usa `LOVABLE_API_KEY` já disponível no projeto.

**Arquivos modificados:**
- `src/pages/SettingsGemini.tsx` (novo)
- `src/pages/SettingsIntegrations.tsx` (adicionar Gemini ao catálogo)
- `src/App.tsx` (nova rota)
- `supabase/functions/ai-copilot/index.ts` (lógica dual OpenAI/Gemini + multimodal real)

