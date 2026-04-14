

## Plan: Fix Tracking Links — No Parentheses + Use rastreio.maxfem.com.br

### Problem
The AI copilot keeps wrapping tracking URLs in parentheses, breaking the link. Additionally, tracking links should use the Maxfem tracking page instead of carrier-specific URLs.

### Changes

**File: `supabase/functions/ai-copilot/index.ts`**

1. **Replace all carrier-specific tracking URLs with Maxfem format** (lines 253-261):
   - Instead of `https://www.loggi.com/rastreador/{code}`, `https://rastreio.fmtransportes.com.br/...`, or `https://rastreamento.correios.com.br/...`
   - Use: `https://rastreio.maxfem.com.br/{tracking_code}` for ALL carriers

2. **Strengthen the system prompt** (line 453):
   - Add explicit instruction: "O link de rastreio é SEMPRE no formato https://rastreio.maxfem.com.br/CODIGO_RASTREIO"
   - Reinforce: never wrap URLs in parentheses, brackets, or any formatting

3. **Harden the sanitization regex** (lines 595-603):
   - Add an additional pass to catch any remaining `(url)` patterns the model might generate

4. **Also update the local lookup** (`lookupOrdersByCpf`):
   - If `tracking_url` is stored in DB with old carrier URLs, override it with the Maxfem format when `tracking_code` exists

### Result
- All tracking links will be `https://rastreio.maxfem.com.br/{tracking_code}`
- No parentheses, no brackets, no Markdown formatting around URLs
- Works for Loggi, Correios, FM Transportes, and any other carrier

