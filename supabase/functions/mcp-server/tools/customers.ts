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
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
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

  server.tool("create_customer", {
    description: "Create or update a customer (upsert by email or phone).",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        phone: { type: "string" },
        name: { type: "string" },
        external_id: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        custom_fields: { type: "object" },
        source: { type: "string" },
        add_to_lists: { type: "array", items: { type: "string" } },
        consent: { type: "object", properties: { email: { type: "boolean" }, whatsapp: { type: "boolean" } } }
      }
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("customers:write", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

      if (!args.email && !args.phone) {
        return { content: [{ type: "text", text: "Error: At least email or phone is required." }], isError: true };
      }

      let normalizedPhone = args.phone;
      if (normalizedPhone && !normalizedPhone.startsWith("+")) {
        normalizedPhone = `+55${normalizedPhone.replace(/\D/g, "")}`;
      }
      
      const normalizedEmail = args.email?.toLowerCase().trim();

      // Upsert logic: find existing or create
      let existingCustomer = null;
      if (normalizedEmail) {
        const { data } = await supabaseAdmin.from("customers").select("id").eq("tenant_id", tenant_id).eq("email", normalizedEmail).maybeSingle();
        existingCustomer = data;
      }
      if (!existingCustomer && normalizedPhone) {
        const { data } = await supabaseAdmin.from("customers").select("id").eq("tenant_id", tenant_id).eq("phone", normalizedPhone).maybeSingle();
        existingCustomer = data;
      }

      const payload = {
        tenant_id,
        name: args.name,
        email: normalizedEmail,
        phone: normalizedPhone,
        tags: args.tags,
        custom_attributes: args.custom_fields,
        is_lead: true
      };

      let result;
      let wasCreated = false;
      if (existingCustomer) {
        result = await supabaseAdmin.from("customers").update(payload).eq("id", existingCustomer.id).select().single();
      } else {
        result = await supabaseAdmin.from("customers").insert(payload).select().single();
        wasCreated = true;
      }

      if (result.error) return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };

      let listsAdded = 0;
      if (args.add_to_lists && args.add_to_lists.length > 0) {
        const listMembers = args.add_to_lists.map(listId => ({
          tenant_id,
          list_id: listId,
          customer_id: result.data.id
        }));
        const { error: listError } = await supabaseAdmin.from("contact_list_members").upsert(listMembers);
        if (!listError) listsAdded = args.add_to_lists.length;
      }

      return { content: [{ type: "text", text: JSON.stringify({ id: result.data.id, was_created: wasCreated, lists_added: listsAdded }, null, 2) }] };
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
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("customers:read", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

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
