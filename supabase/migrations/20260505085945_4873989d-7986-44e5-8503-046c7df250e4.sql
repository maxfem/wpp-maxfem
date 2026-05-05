-- Create tables for MCP Server
CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    scopes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.mcp_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    api_key_id UUID REFERENCES public.mcp_api_keys(id) ON DELETE SET NULL,
    tool_name TEXT NOT NULL,
    arguments JSONB DEFAULT '{}'::jsonb,
    result_summary TEXT,
    status TEXT DEFAULT 'success',
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_call_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for API Keys using existing get_user_tenant_ids (returns SETOF uuid)
CREATE POLICY "Users can manage API keys of their tenant"
ON public.mcp_api_keys
FOR ALL
TO authenticated
USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- RLS Policies for Call Logs
CREATE POLICY "Users can view call logs of their tenant"
ON public.mcp_call_logs
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Security Definer function to verify MCP keys
CREATE OR REPLACE FUNCTION public.verify_mcp_key(p_key_hash TEXT)
RETURNS TABLE (
    tenant_id UUID,
    api_key_id UUID,
    scopes JSONB,
    is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        k.tenant_id,
        k.id as api_key_id,
        k.scopes,
        TRUE as is_valid
    FROM public.mcp_api_keys k
    WHERE k.key_hash = p_key_hash
      AND k.revoked_at IS NULL
      AND (k.expires_at IS NULL OR k.expires_at > now());
      
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::JSONB, FALSE;
    END IF;
END;
$$;

-- Grant access to service role for Edge Function use
GRANT ALL ON public.mcp_api_keys TO service_role;
GRANT ALL ON public.mcp_call_logs TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_mcp_key(TEXT) TO service_role;
