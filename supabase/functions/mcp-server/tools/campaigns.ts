import { McpServer } from "mcp-lite";
import { supabaseAdmin } from "../lib/audit.ts";
import { checkScope } from "../auth.ts";

export function registerCampaignTools(server: McpServer) {
  server.tool("list_campaigns", {
    description: "List marketing campaigns with status and basic metrics.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "scheduled", "processing", "completed", "paused"] },
        kind: { type: "string", enum: ["campaign", "automation"], default: "campaign" },
        limit: { type: "number", default: 10 }
      }
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("campaigns:read", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

      let query = supabaseAdmin
        .from("campaigns")
        .select("id, name, status, kind, type, created_at, scheduled_at")
        .eq("tenant_id", tenant_id);

      if (args.status) query = query.eq("status", args.status);
      if (args.kind) query = query.eq("kind", args.kind);

      const { data, error } = await query.limit(args.limit).order("created_at", { ascending: false });

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  });

  server.tool("create_campaign", {
    description: "Create a new draft campaign.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["whatsapp", "email", "sms", "multichannel"] },
        kind: { type: "string", enum: ["campaign", "automation"], default: "campaign" },
        list_id: { type: "string", format: "uuid" },
        scheduled_at: { type: "string", format: "date-time" }
      },
      required: ["name", "type"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("campaigns:write", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .insert({
          tenant_id,
          name: args.name,
          type: args.type,
          kind: args.kind,
          list_id: args.list_id,
          scheduled_at: args.scheduled_at,
          status: "draft"
        })
        .select()
        .single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: `Campaign created successfully with ID: ${data.id}` }] };
    }
  });

  server.tool("create_automation", {
    description: "Create a new automation flow (trigger + steps).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        trigger: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["event", "schedule", "list_join", "date_field"] },
            event_name: { type: "string" },
            schedule_cron: { type: "string" },
            list_id: { type: "string" },
            date_field: { type: "string" },
            delay_days: { type: "number" }
          },
          required: ["type"]
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["send_email", "send_whatsapp", "wait", "condition", "tag"] },
              template_id: { type: "string" },
              wait_seconds: { type: "number" },
              condition: { type: "object" },
              tag: { type: "string" }
            },
            required: ["type"]
          }
        },
        status: { type: "string", enum: ["draft", "active"], default: "draft" }
      },
      required: ["name", "trigger", "steps"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("automations:write", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

      // Validate template_ids in steps
      const templateIds = args.steps
        .filter((s: any) => s.template_id)
        .map((s: any) => s.template_id);

      if (templateIds.length > 0) {
        const { data: templates, error: tError } = await supabaseAdmin
          .from("message_templates")
          .select("id")
          .in("id", templateIds)
          .eq("tenant_id", tenant_id);

        if (tError) return { content: [{ type: "text", text: `Error validating templates: ${tError.message}` }], isError: true };
        if ((templates?.length || 0) < templateIds.length) {
          return { content: [{ type: "text", text: "Error: One or more template_ids are invalid or belong to another tenant." }], isError: true };
        }
      }

      const { data, error } = await supabaseAdmin
        .from("automations")
        .insert({
          tenant_id,
          name: args.name,
          trigger: args.trigger,
          steps: args.steps,
          status: args.status
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") return { content: [{ type: "text", text: `Error: Automation "${args.name}" already exists` }], isError: true };
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  });

  server.tool("get_campaign_report", {
    description: "Get detailed analytics and performance metrics for a specific campaign.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", format: "uuid" }
      },
      required: ["campaign_id"]
    },
    handler: async (args, context: any) => {
      const { tenant_id, scopes } = (context?.authInfo?.extra ?? {}) as any;
      if (!checkScope("campaigns:read", scopes)) {
        return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
      }

      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from("campaigns")
        .select("*")
        .eq("id", args.campaign_id)
        .eq("tenant_id", tenant_id)
        .single();

      if (campaignError) return { content: [{ type: "text", text: `Error: ${campaignError.message}` }], isError: true };

      // Aggregate metrics from campaign_activities
      const { data: stats, error: statsError } = await supabaseAdmin.rpc("get_campaign_stats", {
        p_campaign_id: args.campaign_id
      });

      if (statsError) {
        // Fallback if RPC doesn't exist yet
        const { data: activities } = await supabaseAdmin
          .from("campaign_activities")
          .select("status, sent_at, delivered_at, read_at, clicked_at, converted_at, conversion_value")
          .eq("campaign_id", args.campaign_id);
          
        const aggregated = (activities || []).reduce((acc: any, act: any) => {
          acc.total++;
          if (act.sent_at) acc.sent++;
          if (act.delivered_at) acc.delivered++;
          if (act.read_at) acc.read++;
          if (act.clicked_at) acc.clicked++;
          if (act.converted_at) {
            acc.converted++;
            acc.revenue += (act.conversion_value || 0);
          }
          return acc;
        }, { total: 0, sent: 0, delivered: 0, read: 0, clicked: 0, converted: 0, revenue: 0 });

        return { content: [{ type: "text", text: JSON.stringify({ campaign, stats: aggregated }, null, 2) }] };
      }

      return { content: [{ type: "text", text: JSON.stringify({ campaign, stats }, null, 2) }] };
    }
  });
}
