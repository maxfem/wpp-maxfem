
-- Add access_token column to whatsapp_accounts for per-tenant token support
ALTER TABLE public.whatsapp_accounts
ADD COLUMN IF NOT EXISTS access_token text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.whatsapp_accounts.access_token IS 'Per-tenant WhatsApp access token. Falls back to global WHATSAPP_ACCESS_TOKEN env var when null.';
