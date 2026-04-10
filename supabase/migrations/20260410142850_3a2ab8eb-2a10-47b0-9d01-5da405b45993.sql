
CREATE TABLE public.whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone TEXT,
  verified_name TEXT,
  quality_rating TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view whatsapp accounts"
ON public.whatsapp_accounts FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can insert whatsapp accounts"
ON public.whatsapp_accounts FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can update whatsapp accounts"
ON public.whatsapp_accounts FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can delete whatsapp accounts"
ON public.whatsapp_accounts FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access on whatsapp_accounts"
ON public.whatsapp_accounts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_whatsapp_accounts_updated_at
BEFORE UPDATE ON public.whatsapp_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
