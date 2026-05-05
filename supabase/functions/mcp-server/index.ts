import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { mcpAuthMiddleware } from "./auth.ts";
import { logMcpCall } from "./lib/audit.ts";

import { registerCustomerTools } from "./tools/customers.ts";
import { registerCampaignTools } from "./tools/campaigns.ts";
import { registerListTools } from "./tools/lists.ts";
import { registerTemplateTools } from "./tools/templates.ts";
import { registerChatTools } from "./tools/chat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mcp-key, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function jlog(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const app = new Hono();

const mcpServer = new McpServer({
  name: "maxfem-crm",
  version: "1.0.0",
});

registerCustomerTools(mcpServer);
registerCampaignTools(mcpServer);
registerListTools(mcpServer);
registerTemplateTools(mcpServer);
registerChatTools(mcpServer);

mcpServer.tool("whoami", {
  description: "Identity check for the current MCP session.",
  inputSchema: { type: "object", properties: {} },
  handler: (_args: any, ctx: any) => {
    const extra = ctx?.authInfo?.extra ?? {};
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tenant_id: extra.tenant_id ?? null,
          scopes: extra.scopes ?? [],
          api_key_id: extra.api_key_id ?? null,
          server: "maxfem-crm",
          version: "1.0.0",
        }, null, 2),
      }],
    };
  },
});

const transport = new StreamableHttpTransport();
const handleMcp = transport.bind(mcpServer);

// CORS preflight (no auth)
app.options("/*", (c) => new Response(null, { headers: corsHeaders }));

// Health endpoint (no auth)
app.get("/health", (c) => {
  return new Response(
    JSON.stringify({ status: "ok", server: "maxfem-crm", version: "1.0.0", ts: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
app.get("/mcp-server/health", (c) => {
  return new Response(
    JSON.stringify({ status: "ok", server: "maxfem-crm", version: "1.0.0", ts: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

app.all("/*", mcpAuthMiddleware, async (c) => {
  const startTime = Date.now();
  const reqId = crypto.randomUUID();

  const mcpContext = {
    tenant_id: c.get("tenant_id") as string,
    api_key_id: c.get("api_key_id") as string,
    scopes: c.get("scopes") as string[],
  };

  let bodyForLog: any = null;
  let forwardedReq = c.req.raw;
  if (c.req.method === "POST") {
    const text = await c.req.raw.clone().text();
    try { bodyForLog = JSON.parse(text); } catch { /* non-JSON */ }
    forwardedReq = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: text,
    });
  }

  const rpcMethod = bodyForLog?.method ?? c.req.method;
  const toolName = bodyForLog?.method === "tools/call" ? bodyForLog?.params?.name : undefined;

  jlog("info", "mcp.request", {
    reqId,
    method: rpcMethod,
    tool: toolName,
    tenantId: mcpContext.tenant_id,
    apiKeyId: mcpContext.api_key_id,
  });

  let response: Response;
  try {
    response = await handleMcp(forwardedReq, {
      authInfo: {
        token: "[redacted]",
        scopes: Array.isArray(mcpContext.scopes) ? mcpContext.scopes : [],
        extra: mcpContext,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    jlog("error", "mcp.handler_throw", {
      reqId,
      method: rpcMethod,
      tool: toolName,
      tenantId: mcpContext.tenant_id,
      durationMs,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: bodyForLog?.id ?? null,
        error: { code: -32603, message: "Internal error", data: { reqId } },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Merge CORS into response
  const merged = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeaders)) merged.headers.set(k, v);

  const durationMs = Date.now() - startTime;
  const ok = response.status >= 200 && response.status < 300;

  jlog(ok ? "info" : "warn", "mcp.response", {
    reqId,
    method: rpcMethod,
    tool: toolName,
    tenantId: mcpContext.tenant_id,
    status: response.status,
    durationMs,
    ok,
  });

  if (bodyForLog?.method === "tools/call" && toolName) {
    logMcpCall({
      tenant_id: mcpContext.tenant_id,
      api_key_id: mcpContext.api_key_id,
      tool_name: toolName,
      arguments: bodyForLog.params?.arguments,
      status: ok ? "success" : "error",
      duration_ms: durationMs,
    }).catch((e) => jlog("error", "mcp.audit_failed", { reqId, error: String(e) }));
  }

  return merged;
});

Deno.serve(app.fetch);
