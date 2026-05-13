import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OAuth: a página de consentimento é em www.bling.com.br
// API token + recursos: api.bling.com.br/Api/v3 (memory: feedback_bling_api_endpoint)
const BLING_AUTH_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FALLBACK_CLIENT_ID = Deno.env.get("BLING_CLIENT_ID") || "";
  const FALLBACK_CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET") || "";
  // O front é servido com base "/crm/" (vite base + BrowserRouter basename "/crm"),
  // então o redirect pós-OAuth PRECISA do prefixo /crm — senão o router não casa e a tela fica branca.
  const APP_URL = Deno.env.get("APP_URL") || "https://maxfem.tech/crm";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/bling-auth?action=callback`;

  async function loadIntegration(tenantId: string) {
    const { data } = await supabase
      .from("integrations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("provider", "bling")
      .maybeSingle();
    return data;
  }

  function pickCreds(cfg: Record<string, unknown> | null | undefined) {
    const config = cfg || {};
    return {
      client_id: (config["client_id"] as string) || FALLBACK_CLIENT_ID,
      client_secret: (config["client_secret"] as string) || FALLBACK_CLIENT_SECRET,
    };
  }

  try {
    // Step 1 — Authorize
    if (action === "authorize") {
      const tenantId = url.searchParams.get("tenant_id");
      if (!tenantId) return jsonError(400, "tenant_id required");

      const integration = await loadIntegration(tenantId);
      const creds = pickCreds(integration?.config as any);
      if (!creds.client_id) return htmlError(400, "Cole client_id e client_secret antes de conectar.");

      const authUrl = `${BLING_AUTH_URL}?response_type=code&client_id=${encodeURIComponent(creds.client_id)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(tenantId)}`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authUrl } });
    }

    // Step 2 — Callback
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const tenantId = url.searchParams.get("state");
      const errParam = url.searchParams.get("error");

      if (errParam) {
        return redirectToApp(APP_URL, `error=${encodeURIComponent(errParam)}`);
      }
      if (!code || !tenantId) return htmlError(400, "Missing code or state");

      const integration = await loadIntegration(tenantId);
      const creds = pickCreds(integration?.config as any);
      if (!creds.client_id || !creds.client_secret) {
        return redirectToApp(APP_URL, "error=" + encodeURIComponent("client_id/secret não configurados"));
      }

      const basic = btoa(`${creds.client_id}:${creds.client_secret}`);
      const tokenRes = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error("Bling token error:", tokenRes.status, tokenData);
        return redirectToApp(APP_URL, "error=" + encodeURIComponent(tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`));
      }

      const now = new Date();
      const accessExpiresAt = new Date(now.getTime() + (tokenData.expires_in || 21600) * 1000).toISOString();
      const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const newConfig = {
        ...(integration?.config as any || {}),
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        scope: tokenData.scope || "",
      };

      if (integration) {
        await supabase
          .from("integrations")
          .update({ config: newConfig, is_active: true, sync_status: "idle", sync_error: null, updated_at: now.toISOString() })
          .eq("id", integration.id);
      } else {
        await supabase.from("integrations").insert({
          tenant_id: tenantId,
          provider: "bling",
          config: newConfig,
          is_active: true,
          sync_status: "idle",
        });
      }

      return redirectToApp(APP_URL, "connected=true");
    }

    // Step 3 — Refresh (chamado pelo cron horário OU manualmente)
    if (action === "refresh") {
      let body: any = {};
      try { body = await req.json(); } catch { /* sem body */ }
      const tenantFilter = body?.tenant_id || null;

      let query = supabase
        .from("integrations")
        .select("*")
        .eq("provider", "bling")
        .eq("is_active", true);
      if (tenantFilter) query = query.eq("tenant_id", tenantFilter);

      const { data: integrations, error } = await query;
      if (error) throw error;

      let refreshed = 0;
      let errors = 0;
      let skipped = 0;

      for (const integration of integrations || []) {
        const cfg = integration.config as any;
        const creds = pickCreds(cfg);
        if (!cfg?.refresh_token || !creds.client_id || !creds.client_secret) {
          skipped++;
          continue;
        }

        // refresh se faltam <2h pra expirar (ou se já expirou)
        const expiresAt = cfg.access_expires_at ? new Date(cfg.access_expires_at).getTime() : 0;
        const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
        if (expiresAt > twoHoursFromNow && !body?.force) {
          skipped++;
          continue;
        }

        try {
          const basic = btoa(`${creds.client_id}:${creds.client_secret}`);
          const tokenRes = await fetch(BLING_TOKEN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${basic}`,
              Accept: "application/json",
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: cfg.refresh_token,
            }),
          });

          const tokenData = await tokenRes.json().catch(() => ({}));
          if (!tokenRes.ok || !tokenData.access_token) {
            console.error(`Bling refresh fail for ${integration.id}:`, tokenRes.status, tokenData);
            await supabase.from("integrations").update({
              sync_error: `Refresh failed: ${tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`}`,
              updated_at: new Date().toISOString(),
            }).eq("id", integration.id);
            errors++;
            continue;
          }

          const now = new Date();
          const newConfig = {
            ...cfg,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || cfg.refresh_token,
            access_expires_at: new Date(now.getTime() + (tokenData.expires_in || 21600) * 1000).toISOString(),
            refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          };

          await supabase.from("integrations").update({
            config: newConfig,
            sync_error: null,
            updated_at: now.toISOString(),
          }).eq("id", integration.id);

          refreshed++;
        } catch (err: any) {
          console.error(`Bling refresh exception for ${integration.id}:`, err.message);
          errors++;
        }
      }

      return jsonOk({ refreshed, errors, skipped, total: integrations?.length || 0 });
    }

    // Step 4 — Disconnect
    if (action === "disconnect") {
      const body = await req.json().catch(() => ({}));
      const tenantId = body.tenant_id;
      if (!tenantId) return jsonError(400, "tenant_id required");

      // Mantém client_id/secret pra reconectar, só limpa tokens e desativa
      const integration = await loadIntegration(tenantId);
      const cfg = (integration?.config as any) || {};
      const cleanConfig = {
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
      };

      await supabase
        .from("integrations")
        .update({
          is_active: false,
          config: cleanConfig,
          sync_status: "idle",
          sync_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("provider", "bling");

      return jsonOk({ ok: true });
    }

    return jsonError(400, "Invalid action");
  } catch (err: any) {
    console.error("bling-auth error:", err);
    return jsonError(500, err.message || String(err));
  }
});

function jsonOk(body: any) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function htmlError(status: number, message: string) {
  return new Response(`<h1>Bling OAuth · erro</h1><p>${message}</p>`, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}
function redirectToApp(appUrl: string, queryString: string) {
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: `${appUrl}/settings/integrations/bling?${queryString}`,
    },
  });
}
