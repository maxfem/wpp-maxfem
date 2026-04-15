---
name: Gemini AI Integration
description: Gemini via Lovable AI Gateway for multimodal copilot (image, video, audio). Priority over OpenAI. No API key needed.
type: feature
---
- Provider: `gemini` in `integrations` table
- Uses `LOVABLE_API_KEY` via `https://ai.gateway.lovable.dev/v1/chat/completions`
- Models: `google/gemini-2.5-flash` (default), `google/gemini-2.5-pro`
- Priority: Gemini > OpenAI when both active
- Multimodal: images via base64 data URL, audio via `input_audio` format, video via base64
- Media downloaded from Supabase storage and converted to base64 before sending
- Config page: `/settings/integrations/gemini` (`SettingsGemini.tsx`)
- Same tone/prompt system as OpenAI integration
