
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
  user_display_name TEXT;
  tenant_slug TEXT;
BEGIN
  -- Get display name
  user_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email);
  
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, user_display_name);
  
  -- Generate slug
  tenant_slug := lower(regexp_replace(user_display_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || extract(epoch from now())::bigint;
  
  -- Create tenant
  INSERT INTO public.tenants (name, slug)
  VALUES ('Loja de ' || user_display_name, tenant_slug)
  RETURNING id INTO new_tenant_id;
  
  -- Add user as admin of tenant
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (new_tenant_id, NEW.id, 'admin');
  
  -- Add admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
