ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_phone_key UNIQUE (tenant_id, phone);
ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_email_key UNIQUE (tenant_id, email);