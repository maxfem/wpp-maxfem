-- Suporte a múltiplos números WhatsApp por tenant (apelido + WABA + token opcional)
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant_active
  ON public.whatsapp_accounts(tenant_id, is_active);
