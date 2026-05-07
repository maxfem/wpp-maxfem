-- Update MCP API keys to include new scopes if they don't have them
UPDATE public.mcp_api_keys
SET scopes = scopes || '["automations:write", "popups:write", "customers:write"]'::jsonb
WHERE NOT (scopes ? 'automations:write');

-- Clean up any duplicates that might occur from multiple runs (jsonb_build_array style)
UPDATE public.mcp_api_keys
SET scopes = (
  SELECT jsonb_agg(distinct val)
  FROM jsonb_array_elements(scopes) AS val
)
WHERE jsonb_typeof(scopes) = 'array';
