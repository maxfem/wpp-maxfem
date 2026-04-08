
CREATE TABLE public.contact_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'manual',
  filter_rules JSONB DEFAULT '{}'::jsonb,
  customer_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view lists" ON public.contact_lists FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Members can insert lists" ON public.contact_lists FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Members can update lists" ON public.contact_lists FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Members can delete lists" ON public.contact_lists FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE TRIGGER update_contact_lists_updated_at BEFORE UPDATE ON public.contact_lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contact_list_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(list_id, customer_id)
);

ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view list members" ON public.contact_list_members FOR SELECT USING (list_id IN (SELECT id FROM public.contact_lists WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));
CREATE POLICY "Members can insert list members" ON public.contact_list_members FOR INSERT WITH CHECK (list_id IN (SELECT id FROM public.contact_lists WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));
CREATE POLICY "Members can delete list members" ON public.contact_list_members FOR DELETE USING (list_id IN (SELECT id FROM public.contact_lists WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))));
