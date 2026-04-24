
-- Tabela de regras
CREATE TABLE public.instagram_comment_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ig_account_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scope TEXT NOT NULL DEFAULT 'all', -- 'all' | 'posts' | 'lives' | 'specific'
  post_ids TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  match_mode TEXT NOT NULL DEFAULT 'contains', -- 'contains' | 'exact'
  use_ai_intent BOOLEAN NOT NULL DEFAULT false,
  public_reply_text TEXT NOT NULL,
  dm_text TEXT NOT NULL,
  dm_link_url TEXT,
  cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  daily_limit_per_user INTEGER NOT NULL DEFAULT 3,
  stats_sent INTEGER NOT NULL DEFAULT 0,
  stats_dm_sent INTEGER NOT NULL DEFAULT 0,
  stats_clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ig_rules_account_active ON public.instagram_comment_rules(ig_account_id, is_active);
CREATE INDEX idx_ig_rules_tenant ON public.instagram_comment_rules(tenant_id);

ALTER TABLE public.instagram_comment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view ig comment rules"
ON public.instagram_comment_rules FOR SELECT
TO authenticated
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can insert ig comment rules"
ON public.instagram_comment_rules FOR INSERT
TO authenticated
WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can update ig comment rules"
ON public.instagram_comment_rules FOR UPDATE
TO authenticated
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can delete ig comment rules"
ON public.instagram_comment_rules FOR DELETE
TO authenticated
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Service role full access on ig comment rules"
ON public.instagram_comment_rules FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_ig_comment_rules_updated_at
BEFORE UPDATE ON public.instagram_comment_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de execuções
CREATE TABLE public.instagram_rule_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  rule_id UUID NOT NULL REFERENCES public.instagram_comment_rules(id) ON DELETE CASCADE,
  ig_account_id UUID NOT NULL,
  comment_id TEXT NOT NULL,
  post_id TEXT,
  from_ig_user_id TEXT,
  from_username TEXT,
  matched_by TEXT NOT NULL, -- 'keyword' | 'ai'
  matched_term TEXT,
  public_reply_status TEXT,
  dm_status TEXT,
  dm_message_id TEXT,
  tracked_link_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ig_rule_exec_unique ON public.instagram_rule_executions(rule_id, comment_id);
CREATE INDEX idx_ig_rule_exec_account_user ON public.instagram_rule_executions(ig_account_id, from_ig_user_id, created_at DESC);
CREATE INDEX idx_ig_rule_exec_tenant ON public.instagram_rule_executions(tenant_id);

ALTER TABLE public.instagram_rule_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view ig rule executions"
ON public.instagram_rule_executions FOR SELECT
TO authenticated
USING (is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Service role full access on ig rule executions"
ON public.instagram_rule_executions FOR ALL
TO service_role
USING (true) WITH CHECK (true);
