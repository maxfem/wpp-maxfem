
-- Enable RLS on role_permissions (no policies = locked down to service role)
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Revoke public/anon EXECUTE from SECURITY DEFINER functions (keep service_role + authenticated where needed)
REVOKE EXECUTE ON FUNCTION public.verify_mcp_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_pixel_visitor_to_customer() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_group_member_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_contact_list_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_rfm_scores(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_rfm_lists(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_contact_list_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_unsubscribe_token(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_send_allowed(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Helper functions used inside RLS policies must remain executable by authenticated users
-- (they're called by Postgres while evaluating policies for that role)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids(uuid) TO authenticated;
