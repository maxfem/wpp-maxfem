-- Patch do tenant guard: tratar corretamente chamadas SEM JWT context.
--
-- Cenários que devem bypassar:
--   * Chamada SQL direta via psql/pg_cron/supabase_admin (current_setting('request.jwt.claims') IS NULL)
--   * Edge function com SERVICE_ROLE_KEY (JWT role='service_role')
--
-- Cenários que devem ser barrados:
--   * Caller autenticado de outro tenant (JWT role='authenticated', uid não é membro)
--   * Caller anônimo (JWT role='anon', uid NULL) — bloqueia
--
-- A versão anterior tratava "auth.uid() IS NULL" como bloqueio em qualquer caso,
-- o que quebraria pg_cron/psql se algum futuro caller passar por essas RPCs sem JWT.

CREATE OR REPLACE FUNCTION public.assert_tenant_member(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
  v_role   text;
BEGIN
  -- Chamada SQL direta (sem PostgREST/JWT): postgres, pg_cron, supabase_admin → bypass
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN;
  END IF;

  -- Com JWT, extrai role
  v_role := COALESCE((v_claims::jsonb ->> 'role'), '');

  -- service_role (edge functions, admin SDK): bypass
  IF v_role = 'service_role' THEN
    RETURN;
  END IF;

  -- Anon ou authenticated sem uid: bloqueia
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tenant guard: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Usuário autenticado: valida membership
  IF NOT public.is_tenant_member(auth.uid(), p_tenant) THEN
    RAISE EXCEPTION 'tenant guard: user is not a member of tenant %', p_tenant USING ERRCODE = '42501';
  END IF;
END;
$$;
