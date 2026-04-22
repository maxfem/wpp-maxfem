-- whatsapp_groups
CREATE TABLE public.whatsapp_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  permission TEXT NOT NULL DEFAULT 'all_can_send' CHECK (permission IN ('all_can_send','only_admins_can_send')),
  external_group_id TEXT,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_groups_tenant ON public.whatsapp_groups(tenant_id);

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view groups"
ON public.whatsapp_groups FOR SELECT
USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can insert groups"
ON public.whatsapp_groups FOR INSERT
WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can update groups"
ON public.whatsapp_groups FOR UPDATE
USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can delete groups"
ON public.whatsapp_groups FOR DELETE
USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

CREATE TRIGGER update_whatsapp_groups_updated_at
BEFORE UPDATE ON public.whatsapp_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- whatsapp_group_members
CREATE TABLE public.whatsapp_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, customer_id)
);

CREATE INDEX idx_whatsapp_group_members_group ON public.whatsapp_group_members(group_id);
CREATE INDEX idx_whatsapp_group_members_customer ON public.whatsapp_group_members(customer_id);

ALTER TABLE public.whatsapp_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group members"
ON public.whatsapp_group_members FOR SELECT
USING (group_id IN (
  SELECT id FROM public.whatsapp_groups
  WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Members can insert group members"
ON public.whatsapp_group_members FOR INSERT
WITH CHECK (group_id IN (
  SELECT id FROM public.whatsapp_groups
  WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Members can update group members"
ON public.whatsapp_group_members FOR UPDATE
USING (group_id IN (
  SELECT id FROM public.whatsapp_groups
  WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Members can delete group members"
ON public.whatsapp_group_members FOR DELETE
USING (group_id IN (
  SELECT id FROM public.whatsapp_groups
  WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
));

-- Trigger to keep member_count fresh
CREATE OR REPLACE FUNCTION public.refresh_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _group_id := OLD.group_id;
  ELSE
    _group_id := NEW.group_id;
  END IF;

  UPDATE public.whatsapp_groups
  SET member_count = (
    SELECT COUNT(*) FROM public.whatsapp_group_members WHERE group_id = _group_id
  ),
  updated_at = now()
  WHERE id = _group_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_group_members_count_ins
AFTER INSERT ON public.whatsapp_group_members
FOR EACH ROW EXECUTE FUNCTION public.refresh_group_member_count();

CREATE TRIGGER trg_group_members_count_del
AFTER DELETE ON public.whatsapp_group_members
FOR EACH ROW EXECUTE FUNCTION public.refresh_group_member_count();

-- Storage bucket for group avatars (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-avatars', 'group-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Group avatars are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-avatars');

CREATE POLICY "Authenticated users can upload group avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'group-avatars');

CREATE POLICY "Authenticated users can update group avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'group-avatars');

CREATE POLICY "Authenticated users can delete group avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'group-avatars');