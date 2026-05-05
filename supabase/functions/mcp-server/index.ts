import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { mcpAuthMiddleware } from "./auth.ts";
import { logMcpCall } from "./lib/audit.ts";

// Import tool registers
import { registerCustomerTools } from "./tools/customers.ts";
import { registerCampaignTools } from "./tools/campaigns.ts";
import { registerListTools } from "./tools/lists.ts";
import { registerTemplateTools } from "./tools/templates.ts";
import { registerChatTools } from "./tools/chat.ts";

const app = new Hono();

const mcpServer = new McpServer({
  name: "maxfem-crm",
  version: "1.0.0",
});

// Register all tools
registerCustomerTools(mcpServer);
registerCampaignTools(mcpServer);
registerListTools(mcpServer);
registerTemplateTools(mcpServer);
registerChatTools(mcpServer);

// Define basic system tools directly
mcpServer.tool("whoami", {
    description: "Identity check for the current MCP session.",
  inputSchema: { type: "object", properties: {} },
  handler: async (_, context: any) => {
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({ 
          tenant_id: context.tenant_id, 
          scopes: context.scopes,
          api_key_id: context.api_key_id
        }, null, 2) 
      }]
    };
  }
});

const transport = new StreamableHttpTransport();
const handleMcp = transport.bind(mcpServer);

app.all("/*", mcpAuthMiddleware, async (c) => {
  const startTime = Date.now();

  const mcpContext = {
    tenant_id: c.get("tenant_id"),
    api_key_id: c.get("api_key_id"),
    scopes: c.get("scopes"),
  };

  // Clone so we can both forward the raw request and inspect body for logging
  let bodyForLog: any = null;
  let forwardedReq = c.req.raw;
  if (c.req.method === "POST") {
    const text = await c.req.raw.clone().text();
    try { bodyForLog = JSON.parse(text); } catch { /* ignore */ }
    forwardedReq = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: text,
    });
  }

  const response = await handleMcp(forwardedReq, { context: mcpContext });

  if (bodyForLog?.method === "tools/call") {
    const duration = Date.now() - startTime;
    logMcpCall({
      tenant_id: mcpContext.tenant_id,
      api_key_id: mcpContext.api_key_id,
      tool_name: bodyForLog.params?.name,
      arguments: bodyForLog.params?.arguments,
      status: response.status === 200 ? "success" : "error",
      duration_ms: duration,
    }).catch(console.error);
  }

  return response;
});

Deno.serve(app.fetch);
