import { Context, Next } from "hono";
import { supabaseAdmin } from "./lib/audit.ts";

export async function mcpAuthMiddleware(c: Context, next: Next) {
  const key = c.req.header("X-MCP-Key");

  if (!key) {
    return c.json({ error: "Missing X-MCP-Key header" }, 401);
  }

  // Hash key to compare (X-MCP-Key format is expected to be mcp_...)
  // In a real scenario, we'd hash the full key. For now, we use simple matching
  // or a hash if we want to be more secure.
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  const { data: authData, error } = await supabaseAdmin.rpc("verify_mcp_key", {
    p_key_hash: keyHash
  });

  if (error || !authData || authData.length === 0 || !authData[0].is_valid) {
    console.error("[mcp-auth] Invalid key:", error);
    return c.json({ error: "Invalid or revoked API key" }, 403);
  }

  const { tenant_id, api_key_id, scopes } = authData[0];
  
  // Set context for tools
  c.set("tenant_id", tenant_id);
  c.set("api_key_id", api_key_id);
  c.set("scopes", scopes);

  await next();
}

export function checkScope(requiredScope: string, userScopes: string[]): boolean {
  if (userScopes.includes("*") || userScopes.includes("*:*")) return true;
  
  const [domain, action] = requiredScope.split(":");
  if (userScopes.includes(`${domain}:*`)) return true;
  
  return userScopes.includes(requiredScope);
}
