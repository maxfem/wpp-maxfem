import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

export async function logMcpCall({
  tenant_id,
  api_key_id,
  tool_name,
  arguments: args,
  result_summary,
  status,
  duration_ms,
}: {
  tenant_id: string;
  api_key_id: string;
  tool_name: string;
  arguments: any;
  result_summary?: string;
  status: string;
  duration_ms: number;
}) {
  await supabaseAdmin.from("mcp_call_logs").insert({
    tenant_id,
    api_key_id,
    tool_name,
    arguments: args,
    result_summary,
    status,
    duration_ms,
  });

  // Also log to general audit logs
  await supabaseAdmin.from("audit_logs").insert({
    tenant_id,
    entity: "mcp",
    entity_id: api_key_id,
    action: `mcp.${tool_name}`,
    new_data: { arguments: args, status, result_summary },
  });
}
