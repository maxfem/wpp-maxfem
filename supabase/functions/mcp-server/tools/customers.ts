import { McpServer } from "mcp-lite";
import { supabaseAdmin } from "../lib/audit.ts";
import { checkScope } from "../auth.ts";

export function registerCustomerTools(server: McpServer) {
  server.tool("search_customers", {
        description: "Search for customers in the CRM using various filters.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by name, email or phone" },
        rfm_segment: { type: "string", description: "Filter by RFM segment (e.g., 'Champions', 'At Risk')" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
        limit: { type: "number", default: 20 },
        offset: { type: "number", default: 0 }
      }
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = context;
      if (!checkScope("customers:read", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden. Missing 'customers:read' scope." }], isError: true };
      }

      let query = supabaseAdmin
        .from("customers")
        .select("*")
        .eq("tenant_id", tenant_id);

      if (args.query) {
        query = query.or(`name.ilike.%${args.query}%,email.ilike.%${args.query}%,phone.ilike.%${args.query}%`);
      }
      if (args.rfm_segment) {
        query = query.eq("rfm_segment", args.rfm_segment);
      }
      if (args.tags && args.tags.length > 0) {
        query = query.contains("tags", args.tags);
      }

      const { data, error } = await query
        .range(args.offset, args.offset + args.limit - 1)
        .order("created_at", { ascending: false });

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    }
  });

  server.tool("get_customer_360", {
        description: "Get full 360 view of a customer including orders and chat activities.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", format: "uuid" }
      },
      required: ["customer_id"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = context;
      if (!checkScope("customers:read", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

      // Parallel fetch for speed
      const [customerRes, activitiesRes] = await Promise.all([
        supabaseAdmin.from("customers").select("*").eq("id", args.customer_id).eq("tenant_id", tenant_id).single(),
        supabaseAdmin.from("campaign_activities").select("*").eq("customer_id", args.customer_id).eq("tenant_id", tenant_id).limit(10).order("created_at", { ascending: false })
      ]);

      if (customerRes.error) return { content: [{ type: "text", text: `Error: ${customerRes.error.message}` }], isError: true };

      const result = {
        profile: customerRes.data,
        recent_activities: activitiesRes.data || []
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  });
}
