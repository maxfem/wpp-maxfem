import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_BUSINESS_ACCOUNT_ID = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const statusMap: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "pending",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
  IN_APPEAL: "in_appeal",
};

const categoryMap: Record<string, string> = {
  MARKETING: "marketing",
  UTILITY: "utility",
  AUTHENTICATION: "authentication",
};

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all templates that are pending or draft with a meta_template_id (already submitted)
    const { data: pendingTemplates, error: fetchErr } = await supabase
      .from("message_templates")
      .select("id, name, status, category, meta_template_id, tenant_id")
      .in("status", ["pending", "draft"])
      .not("meta_template_id", "is", null);

    if (fetchErr || !pendingTemplates || pendingTemplates.length === 0) {
      console.log("No pending templates to check:", fetchErr?.message || "0 templates");
      return new Response(JSON.stringify({ checked: 0, updated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Checking ${pendingTemplates.length} pending template(s) on Meta`);

    // Fetch all templates from Meta API
    const metaUrl = `https://graph.facebook.com/v22.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=250`;
    const metaResponse = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });

    if (!metaResponse.ok) {
      const err = await metaResponse.json();
      console.error("Meta API error:", err);
      return new Response(JSON.stringify({ error: "Meta API error" }), { status: 502 });
    }

    const metaResult = await metaResponse.json();
    const metaTemplates: { id: string; name: string; status: string; category: string }[] =
      metaResult.data || [];

    let updated = 0;

    for (const local of pendingTemplates) {
      const metaMatch = metaTemplates.find(
        (m) =>
          (local.meta_template_id && m.id === local.meta_template_id) ||
          m.name === local.name
      );

      if (!metaMatch) continue;

      const newStatus = statusMap[metaMatch.status] || metaMatch.status.toLowerCase();
      const newCategory = categoryMap[metaMatch.category] || metaMatch.category.toLowerCase();

      if (local.status !== newStatus || local.category !== newCategory) {
        await supabase
          .from("message_templates")
          .update({ status: newStatus, category: newCategory })
          .eq("id", local.id);
        updated++;
        console.log(`Template "${local.name}" updated: ${local.status} → ${newStatus}`);
      }
    }

    console.log(`Sync complete: ${pendingTemplates.length} checked, ${updated} updated`);

    return new Response(
      JSON.stringify({ checked: pendingTemplates.length, updated }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cron sync error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});
