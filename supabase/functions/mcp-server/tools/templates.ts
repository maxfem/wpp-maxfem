import { McpServer } from "mcp-lite";
import { supabaseAdmin } from "../lib/audit.ts";
import { checkScope } from "../auth.ts";

export function registerTemplateTools(server: McpServer) {
  server.tool({
    name: "list_message_templates",
    description: "List all WhatsApp or Email templates.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["whatsapp", "email"] },
        status: { type: "string" }
      }
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = context;
      if (!checkScope("templates:read", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      if (args.channel === "whatsapp") {
        let query = supabaseAdmin.from("message_templates").select("*").eq("tenant_id", tenant_id);
        if (args.status) query = query.eq("status", args.status);
        const { data, error } = await query;
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } else {
        let query = supabaseAdmin.from("email_templates").select("*").eq("tenant_id", tenant_id);
        const { data, error } = await query;
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    }
  });

  server.tool({
    name: "create_whatsapp_template",
    description: "Create a new WhatsApp template and submit to Meta for approval.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        category: { type: "string", enum: ["MARKETING", "UTILITY", "AUTHENTICATION"] },
        body: { type: "string" },
        buttons: { type: "array", items: { type: "object" } }
      },
      required: ["name", "category", "body"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = context;
      if (!checkScope("templates:write", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      // In a real app, we'd call the whatsapp-template Edge Function here
      // For MCP, we'll insert into the DB and let the user know it needs sync
      const { data, error } = await supabaseAdmin.from("message_templates").insert({
        tenant_id,
        name: args.name,
        category: args.category.toLowerCase(),
        body: args.body,
        buttons: args.buttons || [],
        status: "pending"
      }).select().single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: `WhatsApp template created with ID: ${data.id}. Please go to the dashboard to submit to Meta.` }] };
    }
  });
}
