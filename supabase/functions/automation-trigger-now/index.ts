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
    const tenantIdInput = body?.tenant_id as string | undefined;

    if (!campaignId && !tenantIdInput) {
      return new Response(JSON.stringify({ error: "campaign_id or tenant_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let tenantId: string;
    let campaignIds: string[] = [];

    if (campaignId) {
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

      if (campaign.status !== "running") {
        return new Response(JSON.stringify({
          error: "campaign_not_running",
          message: "A automação precisa estar Ativa para processar a fila.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      tenantId = campaign.tenant_id;
      campaignIds = [campaign.id];
    } else {
      tenantId = tenantIdInput!;
    }

    const { data: isMember } = await admin.rpc("is_tenant_member", {
      _user_id: user.id, _tenant_id: tenantId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // "Processar fila" só destrava items que ainda NÃO entraram no flow (current_node_id='start' ou null).
    // Items aguardando em wait nodes (scheduled_for futuro + current_node_id já avançado) NÃO são tocados —
    // os horários configurados nos nós de aguardar são respeitados.
    const nowIso = new Date().toISOString();
    let pendingQuery = admin
      .from("automation_queue")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");
    if (campaignId) pendingQuery = pendingQuery.eq("campaign_id", campaignId);
    const { count: pendingCount } = await pendingQuery;

    let updateQuery = admin
      .from("automation_queue")
      .update({ scheduled_for: nowIso })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .or("current_node_id.is.null,current_node_id.eq.start");
    if (campaignId) updateQuery = updateQuery.eq("campaign_id", campaignId);
    await updateQuery;

    // Invoke campaign-executor asynchronously so this trigger returns 200 quickly.
    const executorPayload = campaignId
      ? { trigger: "manual", campaign_id: campaignId }
      : { trigger: "manual", tenant_id: tenantId };
    const execPromise = fetch(`${SUPABASE_URL}/functions/v1/campaign-executor`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(executorPayload),
    }).then(async (execRes) => {
      const execText = await execRes.text();
      console.log("[automation-trigger-now] campaign-executor finished", execRes.status, execText.slice(0, 1000));
    }).catch((execErr) => {
      console.error("[automation-trigger-now] campaign-executor failed", execErr);
    });

    (globalThis as any).EdgeRuntime?.waitUntil?.(execPromise);

    return new Response(JSON.stringify({
      success: true,
      pending_before: pendingCount || 0,
      executor_status: "started",
      executor_payload: executorPayload,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[automation-trigger-now] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
