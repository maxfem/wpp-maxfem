import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Authenticate cron requests: accept service_role JWT only
  const authBearer = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authBearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const payload = JSON.parse(atob(authBearer.split(".")[1]));
    if (payload.role !== "service_role") {
      console.log(`[auth] Rejected: role=${payload.role}, expected service_role`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results: Record<string, number> = {
      birthday: 0,
      first_purchase_anniversary: 0,
      inactivity: 0,
      "7 dias após entrega": 0,
    };

    // Get all tenants with active yampi integrations
    const { data: integrations } = await supabase
      .from("integrations")
      .select("tenant_id")
      .eq("provider", "yampi")
      .eq("is_active", true);

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ message: "No active integrations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantIds = integrations.map((i: any) => i.tenant_id);

    // Get all active automations for time-based triggers
    const timeTriggers = ["birthday", "first_purchase_anniversary", "inactivity", "7 dias após entrega"];
    const { data: automations } = await supabase
      .from("campaigns")
      .select("id, trigger_type, tenant_id, name")
      .eq("kind", "automation")
      .eq("status", "running")
      .in("trigger_type", timeTriggers)
      .in("tenant_id", tenantIds);

    if (!automations || automations.length === 0) {
      return new Response(JSON.stringify({ message: "No time-based automations active", results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    for (const automation of automations) {
      const { id: campaignId, trigger_type, tenant_id } = automation;

      try {
        if (trigger_type === "birthday") {
          // Find customers whose birthday matches today (MM-DD)
          // Birthday is stored in custom_attributes.birthday as "YYYY-MM-DD" or similar
          const { data: customers } = await supabase
            .from("customers")
            .select("id, custom_attributes")
            .eq("tenant_id", tenant_id)
            .not("custom_attributes", "is", null);

          for (const c of (customers || [])) {
            const attrs = c.custom_attributes as any;
            const bday = attrs?.birthday;
            if (!bday) continue;

            // Parse birthday — could be "YYYY-MM-DD", "DD/MM/YYYY", etc.
            let bdayMMDD = "";
            if (typeof bday === "string") {
              if (bday.includes("-")) {
                // YYYY-MM-DD
                const parts = bday.split("-");
                if (parts.length >= 3) bdayMMDD = `${parts[1]}-${parts[2].substring(0, 2)}`;
              } else if (bday.includes("/")) {
                // DD/MM/YYYY
                const parts = bday.split("/");
                if (parts.length >= 2) bdayMMDD = `${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
              }
            } else if (bday?.date) {
              // Yampi returns { date: "YYYY-MM-DD HH:MM:SS" }
              const datePart = String(bday.date).substring(0, 10);
              const parts = datePart.split("-");
              if (parts.length >= 3) bdayMMDD = `${parts[1]}-${parts[2]}`;
            }

            if (bdayMMDD === todayMMDD) {
              const { error } = await supabase.from("automation_queue").insert({
                tenant_id,
                campaign_id: campaignId,
                customer_id: c.id,
                trigger_type: "birthday",
                trigger_data: { birthday: bday },
                status: "pending",
                current_node_id: "start",
              });
              if (!error || error.message?.includes("duplicate")) {
                if (!error) results.birthday++;
              } else {
                console.error("Birthday queue error:", error.message);
              }
            }
          }
        }

        if (trigger_type === "first_purchase_anniversary") {
          // Customers whose first order was exactly N years ago today
          const { data: customers } = await supabase
            .from("customers")
            .select("id, last_order_at, total_orders")
            .eq("tenant_id", tenant_id)
            .gte("total_orders", 1)
            .not("last_order_at", "is", null);

          for (const c of (customers || [])) {
            const orderDate = new Date(c.last_order_at);
            const orderMMDD = `${String(orderDate.getMonth() + 1).padStart(2, "0")}-${String(orderDate.getDate()).padStart(2, "0")}`;
            const yearsDiff = today.getFullYear() - orderDate.getFullYear();

            if (orderMMDD === todayMMDD && yearsDiff >= 1) {
              const { error } = await supabase.from("automation_queue").insert({
                tenant_id,
                campaign_id: campaignId,
                customer_id: c.id,
                trigger_type: "first_purchase_anniversary",
                trigger_data: { years: yearsDiff, first_order_date: c.last_order_at },
                status: "pending",
                current_node_id: "start",
              });
              if (!error) results.first_purchase_anniversary++;
            }
          }
        }

        if (trigger_type === "inactivity") {
          // Determine inactivity period from automation name (30, 60, 90 days default 30)
          const nameMatch = automation.name?.match(/(\d+)\s*dias?/i);
          const inactivityDays = nameMatch ? parseInt(nameMatch[1]) : 30;

          const cutoffDate = new Date(today);
          cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);
          const cutoffStart = new Date(cutoffDate);
          cutoffStart.setDate(cutoffStart.getDate() - 1); // 1-day window

          const { data: customers } = await supabase
            .from("customers")
            .select("id, last_order_at")
            .eq("tenant_id", tenant_id)
            .gte("total_orders", 1)
            .gte("last_order_at", cutoffStart.toISOString())
            .lte("last_order_at", cutoffDate.toISOString());

          for (const c of (customers || [])) {
            const { error } = await supabase.from("automation_queue").insert({
              tenant_id,
              campaign_id: campaignId,
              customer_id: c.id,
              trigger_type: "inactivity",
              trigger_data: { days_inactive: inactivityDays, last_order_at: c.last_order_at },
              status: "pending",
              current_node_id: "start",
            });
            if (!error) results.inactivity++;
          }
        }

        if (trigger_type === "7 dias após entrega") {
          // Orders delivered exactly 7 days ago
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const dayStart = new Date(sevenDaysAgo);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(sevenDaysAgo);
          dayEnd.setHours(23, 59, 59, 999);

          const { data: orders } = await supabase
            .from("orders")
            .select("id, customer_id, order_number")
            .eq("tenant_id", tenant_id)
            .eq("status", "delivered")
            .gte("updated_at", dayStart.toISOString())
            .lte("updated_at", dayEnd.toISOString());

          for (const o of (orders || [])) {
            const { error } = await supabase.from("automation_queue").insert({
              tenant_id,
              campaign_id: campaignId,
              customer_id: o.customer_id,
              trigger_type: "7 dias após entrega",
              trigger_data: { order_id: o.id, order_number: o.order_number },
              status: "pending",
              current_node_id: "start",
            });
            if (!error) results["7 dias após entrega"]++;
          }
        }
      } catch (err) {
        console.error(`Error processing automation ${campaignId} (${trigger_type}):`, err);
      }
    }

    console.log("automation-cron results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("automation-cron error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
