import { McpServer } from "mcp-lite";
import { supabaseAdmin } from "../lib/audit.ts";
import { checkScope } from "../auth.ts";

export function registerListTools(server: McpServer) {
  server.tool("list_contact_lists", {
        description: "Get all contact lists for the tenant.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["manual", "dynamic", "rfm"] }
      }
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("lists:read", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      let query = supabaseAdmin.from("contact_lists").select("*").eq("tenant_id", tenant_id);
      if (args.type) query = query.eq("type", args.type);

      const { data, error } = await query.order("name");
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  });

  server.tool("create_contact_list", {
        description: "Create a new contact list (manual or dynamic).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        type: { type: "string", enum: ["manual", "dynamic"], default: "dynamic" },
        filter_rules: { type: "object", description: "JSON rules for dynamic lists" }
      },
      required: ["name"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("lists:write", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      const { data, error } = await supabaseAdmin.from("contact_lists").insert({
        tenant_id,
        name: args.name,
        description: args.description,
        type: args.type,
        filter_rules: args.filter_rules || {},
        customer_count: 0
      }).select().single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: `List created with ID: ${data.id}` }] };
    }
  });
}
