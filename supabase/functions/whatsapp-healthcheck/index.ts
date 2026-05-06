import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user from token
    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant_id from request or first tenant
    const { tenant_id } = await req.json().catch(() => ({}));
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify tenant membership
    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: user.id, _tenant_id: tenant_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Check Account Status
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    const health: any = {
      account: {
        active: !!waAccount,
        display_phone: waAccount?.display_phone || "Não configurado",
        quality: waAccount?.quality_rating || "UNKNOWN",
        tier: waAccount?.messaging_limit_tier || "N/A",
        name_status: waAccount?.name_status || "N/A",
      },
      token: {
        valid: false,
        source: "env",
      },
      webhooks: {
        healthy: false,
      },
      queue: {
        pending: 0,
        oldest_pending_hours: 0,
      },
      templates: {
        approved: 0,
        draft: 0,
        rejected: 0,
      },
      errors: [],
      recommendations: []
    };

    // 2. Validate Token with Meta
    const accessToken = waAccount?.access_token || Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    if (accessToken) {
      try {
        const metaRes = await fetch("https://graph.facebook.com/v22.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        health.token.valid = metaRes.ok;
        if (!metaRes.ok) {
          const err = await metaRes.json();
          health.token.error = err.error?.message;
          health.recommendations.push({
            code: "TOKEN_INVALID",
            level: "critical",
            message: "O token de acesso do WhatsApp expirou ou é inválido.",
            action: "Reconectar Meta"
          });
        }
      } catch (e) {
        health.token.error = String(e);
      }
    } else {
      health.recommendations.push({
        code: "TOKEN_MISSING",
        level: "critical",
        message: "Nenhum token de acesso configurado.",
        action: "Configurar WhatsApp"
      });
    }

    // 3. Check Templates
    const { data: templates } = await supabase
      .from("message_templates")
      .select("status")
      .eq("tenant_id", tenant_id);
    
    if (templates) {
      health.templates.approved = templates.filter(t => t.status === 'approved').length;
      health.templates.draft = templates.filter(t => t.status === 'draft' || t.status === 'pending').length;
      health.templates.rejected = templates.filter(t => t.status === 'rejected').length;

      if (health.templates.draft > 0) {
        health.recommendations.push({
          code: "TEMPLATES_DRAFT",
          level: "warning",
          message: `${health.templates.draft} templates estão em rascunho e não podem ser enviados.`,
          action: "Sincronizar Templates"
        });
      }
    }

    // 4. Check Queue
    const { data: queueStats } = await supabase
      .from("automation_queue")
      .select("created_at")
      .eq("tenant_id", tenant_id)
      .eq("status", "pending");
    
    if (queueStats?.length) {
      health.queue.pending = queueStats.length;
      const oldest = new Date(Math.min(...queueStats.map(q => new Date(q.created_at).getTime())));
      health.queue.oldest_pending_hours = Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60));

      if (health.queue.pending > 50 && health.queue.oldest_pending_hours > 2) {
        health.recommendations.push({
          code: "QUEUE_STUCK",
          level: "error",
          message: `A fila tem ${health.queue.pending} itens parados há mais de ${health.queue.oldest_pending_hours}h.`,
          action: "Processar Fila Manualmente"
        });
      }
    }

    // 5. Recent Errors
    const { data: recentErrors } = await supabase
      .from("campaign_activities")
      .select("error_message, created_at, customer_id")
      .eq("tenant_id", tenant_id)
      .eq("channel", "whatsapp")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(5);
    
    health.errors = recentErrors || [];

    return new Response(JSON.stringify(health), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Healthcheck error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
