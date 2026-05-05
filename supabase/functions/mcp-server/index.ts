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

app.all("/*", mcpAuthMiddleware, async (c) => {
  const startTime = Date.now();
  
  // Custom context for mcp-lite handlers
  const mcpContext = {
    tenant_id: c.get("tenant_id"),
    api_key_id: c.get("api_key_id"),
    scopes: c.get("scopes")
  };

  // We need to intercept tool calls for logging
  // mcp-lite doesn't have a direct middleware for tool calls, 
  // so we'll log based on the request body if it's a call
  const body = await c.req.json();
  
  const response = await transport.handleRequest(c.req.raw, mcpServer, mcpContext);
  
  // Post-call logging (non-blocking)
  if (body?.method === "tools/call") {
    const duration = Date.now() - startTime;
    // Log asynchronously
    logMcpCall({
      tenant_id: mcpContext.tenant_id,
      api_key_id: mcpContext.api_key_id,
      tool_name: body.params.name,
      arguments: body.params.arguments,
      status: response.status === 200 ? "success" : "error",
      duration_ms: duration
    }).catch(console.error);
  }

  return response;
});

Deno.serve(app.fetch);
