import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    console.log("[predictive] Starting scoring run...");

    // 1. Fetch all tenants
    const { data: tenants } = await supabase.from("tenants").select("id");
    if (!tenants) throw new Error("No tenants found");

    for (const tenant of tenants) {
      const tenantId = tenant.id;
      console.log(`[predictive] Scoring for tenant: ${tenantId}`);

      // 2. Fetch customers and their orders/activities
      const { data: customers } = await supabase
        .from("customers")
        .select(`
          id, 
          created_at,
          orders (total, created_at),
          campaign_activities (status, read_at, created_at)
        `)
        .eq("tenant_id", tenantId);

      if (!customers) continue;

      for (const customer of customers) {
        const orders = customer.orders || [];
        const activities = customer.campaign_activities || [];

        // --- CLV Calculation ---
        const totalSpent = orders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
        const predictedClv = totalSpent * 1.2; // Simple heuristic: historical + 20% growth projection

        // --- Churn Calculation ---
        let churnProb = 0.5; // Baseline
        
        if (orders.length > 0) {
          const lastOrderDate = new Date(Math.max(...orders.map((o: any) => new Date(o.created_at).getTime())));
          const daysSinceLastOrder = (Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24);
          
          // Calculate avg interval between orders
          let avgInterval = 30; // Default 30 days
          if (orders.length > 1) {
            const sortedDates = orders.map((o: any) => new Date(o.created_at).getTime()).sort();
            const intervals = [];
            for (let i = 1; i < sortedDates.length; i++) {
              intervals.push((sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24));
            }
            avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          }

          // Churn probability increases if daysSinceLastOrder > avgInterval
          churnProb = Math.min(1, daysSinceLastOrder / (avgInterval * 2));
        } else {
          // No orders, check engagement
          const lastActivity = activities.length > 0 
            ? new Date(Math.max(...activities.map((a: any) => new Date(a.created_at).getTime())))
            : new Date(customer.created_at);
          
          const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
          churnProb = Math.min(1, daysSinceActivity / 90); // Churn after 90 days of inactivity
        }

        // 3. Update customer record
        await supabase
          .from("customers")
          .update({
            churn_probability: churnProb,
            predicted_clv: predictedClv,
            last_scoring_at: new Date().toISOString()
          })
          .eq("id", customer.id);

        // 4. Log history
        await supabase.from("predictive_scores_history").insert([
          { customer_id: customer.id, tenant_id: tenantId, score_type: "churn", score_value: churnProb },
          { customer_id: customer.id, tenant_id: tenantId, score_type: "clv", score_value: predictedClv }
        ]);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[predictive] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
