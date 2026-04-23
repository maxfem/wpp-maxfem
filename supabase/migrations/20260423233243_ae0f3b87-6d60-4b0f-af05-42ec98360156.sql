-- Instagram accounts (multi-account per tenant)
CREATE TABLE public.instagram_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ig_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  page_id TEXT NOT NULL,
  page_name TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_reply_dms BOOLEAN NOT NULL DEFAULT false,
  auto_reply_comments BOOLEAN NOT NULL DEFAULT false,
  auto_reply_lives BOOLEAN NOT NULL DEFAULT false,
  live_active_id TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, ig_user_id)
);

CREATE INDEX idx_instagram_accounts_tenant ON public.instagram_accounts(tenant_id);
CREATE INDEX idx_instagram_accounts_ig_user ON public.instagram_accounts(ig_user_id);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view instagram accounts" ON public.instagram_accounts
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can insert instagram accounts" ON public.instagram_accounts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can update instagram accounts" ON public.instagram_accounts
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Members can delete instagram accounts" ON public.instagram_accounts
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Service role full access on instagram_accounts" ON public.instagram_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Instagram DMs
CREATE TABLE public.instagram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ig_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  customer_id UUID,
  ig_conversation_id TEXT,
  ig_user_id TEXT NOT NULL,
  username TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_messages_tenant ON public.instagram_messages(tenant_id);
CREATE INDEX idx_instagram_messages_account ON public.instagram_messages(ig_account_id);
CREATE INDEX idx_instagram_messages_ig_user ON public.instagram_messages(ig_user_id);
CREATE INDEX idx_instagram_messages_created ON public.instagram_messages(created_at DESC);

ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view instagram messages" ON public.instagram_messages
  FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert instagram messages" ON public.instagram_messages
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update instagram messages" ON public.instagram_messages
  FOR UPDATE TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Service role full access on instagram_messages" ON public.instagram_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_instagram_messages_updated_at
  BEFORE UPDATE ON public.instagram_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Instagram comments on posts/Reels
CREATE TABLE public.instagram_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ig_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  comment_id TEXT NOT NULL UNIQUE,
  parent_comment_id TEXT,
  from_username TEXT,
  from_ig_user_id TEXT,
  content TEXT,
  media_type TEXT,
  permalink TEXT,
  replied BOOLEAN NOT NULL DEFAULT false,
  reply_id TEXT,
  reply_content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_comments_tenant ON public.instagram_comments(tenant_id);
CREATE INDEX idx_instagram_comments_account ON public.instagram_comments(ig_account_id);
CREATE INDEX idx_instagram_comments_post ON public.instagram_comments(post_id);
CREATE INDEX idx_instagram_comments_replied ON public.instagram_comments(replied) WHERE replied = false;

ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view instagram comments" ON public.instagram_comments
  FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert instagram comments" ON public.instagram_comments
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update instagram comments" ON public.instagram_comments
  FOR UPDATE TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Service role full access on instagram_comments" ON public.instagram_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_instagram_comments_updated_at
  BEFORE UPDATE ON public.instagram_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Instagram live comments (ephemeral, during broadcasts)
CREATE TABLE public.instagram_live_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ig_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  live_id TEXT NOT NULL,
  comment_id TEXT NOT NULL UNIQUE,
  from_username TEXT,
  from_ig_user_id TEXT,
  content TEXT,
  auto_replied BOOLEAN NOT NULL DEFAULT false,
  reply_content TEXT,
  reply_status TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_live_comments_tenant ON public.instagram_live_comments(tenant_id);
CREATE INDEX idx_instagram_live_comments_live ON public.instagram_live_comments(live_id);
CREATE INDEX idx_instagram_live_comments_created ON public.instagram_live_comments(created_at DESC);

ALTER TABLE public.instagram_live_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view instagram live comments" ON public.instagram_live_comments
  FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert instagram live comments" ON public.instagram_live_comments
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Service role full access on instagram_live_comments" ON public.instagram_live_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);