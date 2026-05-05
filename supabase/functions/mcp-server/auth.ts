import { Context, Next } from "hono";
import { supabaseAdmin } from "./lib/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mcp-key, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function mcpAuthMiddleware(c: Context, next: Next) {
  const url = new URL(c.req.url);
  // Health endpoints bypass auth (matched in index.ts before this middleware)
  if (url.pathname.endsWith("/health")) {
    return next();
  }

  const key = c.req.header("X-MCP-Key") ?? c.req.header("x-mcp-key");

  if (!key) {
    return jsonError(401, "missing_key", "Missing X-MCP-Key header");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: authData, error } = await supabaseAdmin.rpc("verify_mcp_key", {
    p_key_hash: keyHash,
  });

  if (error || !authData || authData.length === 0 || !authData[0].is_valid) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: "warn",
      msg: "mcp.auth_failed",
      hasError: !!error,
      keyPrefix: key.slice(0, 11),
    }));
    return jsonError(403, "invalid_key", "Invalid or revoked API key");
  }

  const { tenant_id, api_key_id, scopes } = authData[0];

  c.set("tenant_id", tenant_id);
  c.set("api_key_id", api_key_id);
  c.set("scopes", scopes);

  await next();
}

export function checkScope(requiredScope: string, userScopes: string[] | undefined | null): boolean {
  if (!Array.isArray(userScopes)) return false;
  if (userScopes.includes("*") || userScopes.includes("*:*")) return true;
  const [domain] = requiredScope.split(":");
  if (userScopes.includes(`${domain}:*`)) return true;
  return userScopes.includes(requiredScope);
}
