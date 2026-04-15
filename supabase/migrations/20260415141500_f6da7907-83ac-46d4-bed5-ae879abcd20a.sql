
DROP VIEW IF EXISTS public.whatsapp_accounts_safe;

CREATE VIEW public.whatsapp_accounts_safe
WITH (security_invoker = on) AS
SELECT id, tenant_id, phone_number_id, display_phone, verified_name, quality_rating, is_active, created_at, updated_at
FROM public.whatsapp_accounts;
