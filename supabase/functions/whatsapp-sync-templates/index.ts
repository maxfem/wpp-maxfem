import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_BUSINESS_ACCOUNT_ID = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { tenant_id } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify tenant membership
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: user.id,
      _tenant_id: tenant_id,
    });

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all templates from Meta API
    const metaUrl = `https://graph.facebook.com/v22.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=250`;
    const metaResponse = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta API error:", metaResult);
      return new Response(JSON.stringify({ error: "Meta API error", details: metaResult }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metaTemplates = metaResult.data || [];
    console.log(`Fetched ${metaTemplates.length} templates from Meta`);

    // Get local templates for this tenant
    const { data: localTemplates } = await supabase
      .from("message_templates")
      .select("id, name, status, category, meta_template_id")
      .eq("tenant_id", tenant_id);

    if (!localTemplates) {
      return new Response(JSON.stringify({ error: "Failed to fetch local templates" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Meta status to local status
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

    let updated = 0;
    let matched = 0;

    for (const local of localTemplates) {
      // Match by meta_template_id first, then by name
      const metaMatch = metaTemplates.find(
        (m: { id: string; name: string }) =>
          (local.meta_template_id && m.id === local.meta_template_id) ||
          m.name === local.name
      );

      if (!metaMatch) continue;
      matched++;

      const newStatus = statusMap[metaMatch.status] || metaMatch.status.toLowerCase();
      const newCategory = categoryMap[metaMatch.category] || metaMatch.category.toLowerCase();

      // Only update if something changed
      if (local.status !== newStatus || local.category !== newCategory || !local.meta_template_id) {
        await supabase
          .from("message_templates")
          .update({
            status: newStatus,
            category: newCategory,
            meta_template_id: metaMatch.id,
          })
          .eq("id", local.id);
        updated++;
        console.log(`Updated template "${local.name}": status=${newStatus}, category=${newCategory}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_meta: metaTemplates.length,
        matched,
        updated,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
