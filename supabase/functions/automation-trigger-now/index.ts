// Manually triggers the campaign-executor for a specific automation/campaign.
// Validates that the caller is a member of the campaign's tenant before
// invoking the executor with the service role key.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = body?.campaign_id as string | undefined;
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: campaign, error: cErr } = await admin
      .from("campaigns")
      .select("id, tenant_id, status")
      .eq("id", campaignId)
      .single();

    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isMember } = await admin.rpc("is_tenant_member", {
      _user_id: user.id, _tenant_id: campaign.tenant_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (campaign.status !== "running") {
      return new Response(JSON.stringify({
        error: "campaign_not_running",
        message: "A automação precisa estar Ativa para processar a fila.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Set scheduled_for=now so any future-scheduled pending items are picked up immediately
    const nowIso = new Date().toISOString();
    const { count: pendingCount } = await admin
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    await admin
      .from("automation_queue")
      .update({ scheduled_for: nowIso })
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .or(`scheduled_for.is.null,scheduled_for.gt.${nowIso}`);

    // Invoke campaign-executor with service-role JWT
    const execRes = await fetch(`${SUPABASE_URL}/functions/v1/campaign-executor`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger: "manual", campaign_id: campaignId }),
    });
    const execText = await execRes.text();
    let execJson: unknown = execText;
    try { execJson = JSON.parse(execText); } catch { /* keep as text */ }

    return new Response(JSON.stringify({
      success: execRes.ok,
      pending_before: pendingCount || 0,
      executor_status: execRes.status,
      executor_result: execJson,
    }), {
      status: execRes.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[automation-trigger-now] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
