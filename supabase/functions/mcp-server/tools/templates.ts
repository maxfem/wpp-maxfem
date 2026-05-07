import { McpServer } from "mcp-lite";
import { supabaseAdmin } from "../lib/audit.ts";
import { checkScope } from "../auth.ts";

export function registerTemplateTools(server: McpServer) {
  server.tool("list_message_templates", {
    description: "List all WhatsApp or Email templates.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["whatsapp", "email"] },
        status: { type: "string" }
      }
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("templates:read", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      if (args.channel === "whatsapp") {
        let query = supabaseAdmin.from("message_templates").select("*").eq("tenant_id", tenant_id);
        if (args.status) query = query.eq("status", args.status);
        const { data, error } = await query;
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } else {
        // Try message_templates with channel='email' first as requested
        let query = supabaseAdmin.from("message_templates").select("*").eq("tenant_id", tenant_id).eq("channel", "email");
        const { data, error } = await query;
        if (error) {
           // Fallback to email_templates if the above fails (legacy)
           const { data: legacyData, error: legacyError } = await supabaseAdmin.from("email_templates").select("*").eq("tenant_id", tenant_id);
           if (legacyError) return { content: [{ type: "text", text: `Error: ${legacyError.message}` }], isError: true };
           return { content: [{ type: "text", text: JSON.stringify(legacyData, null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    }
  });

  server.tool("create_email_template", {
    description: "Create an email template (subject + body_html + preview_text).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        subject: { type: "string" },
        body_html: { type: "string" },
        body_text: { type: "string" },
        preview_text: { type: "string" },
        status: { type: "string", enum: ["draft", "active"], default: "active" }
      },
      required: ["name", "subject", "body_html"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("templates:write", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      if (args.body_html.length > 200000) return { content: [{ type: "text", text: "Error: body_html exceeds 200KB limit." }], isError: true };

      const { data, error } = await supabaseAdmin.from("message_templates").insert({
        tenant_id,
        channel: "email",
        name: args.name,
        subject: args.subject,
        body_html: args.body_html,
        body_text: args.body_text,
        preview_text: args.preview_text,
        status: args.status
      }).select().single();

      if (error) {
        if (error.code === "23505") return { content: [{ type: "text", text: `Error: Template "${args.name}" already exists` }], isError: true };
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  });

  server.tool("create_whatsapp_template", {
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
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("templates:write", scopes)) return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };

      const { data, error } = await supabaseAdmin.from("message_templates").insert({
        tenant_id,
        channel: "whatsapp",
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
