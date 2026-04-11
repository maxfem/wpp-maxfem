import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_AUTH_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const BLING_CLIENT_ID = Deno.env.get("BLING_CLIENT_ID")!;
  const BLING_CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/bling-auth?action=callback`;

  try {
    // Step 1: Authorize — redirect user to Bling
    if (action === "authorize") {
      const tenantId = url.searchParams.get("tenant_id");
      if (!tenantId) {
        return new Response(JSON.stringify({ error: "tenant_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = tenantId;
      const authUrl = `${BLING_AUTH_URL}?response_type=code&client_id=${BLING_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authUrl },
      });
    }

    // Step 2: Callback — exchange code for tokens
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const tenantId = url.searchParams.get("state");

      if (!code || !tenantId) {
        return new Response("Missing code or state", { status: 400 });
      }

      const credentials = btoa(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`);
      const tokenRes = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        console.error("Bling token error:", tokenData);
        return new Response(`Erro ao conectar com Bling: ${JSON.stringify(tokenData)}`, { status: 400 });
      }

      const now = new Date();
      const accessExpiresAt = new Date(now.getTime() + (tokenData.expires_in || 21600) * 1000).toISOString();
      const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const config = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        scope: tokenData.scope || "",
      };

      // Upsert integration
      const { data: existing } = await supabase
        .from("integrations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider", "bling")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("integrations")
          .update({ config, is_active: true, sync_status: "idle", sync_error: null, updated_at: now.toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("integrations").insert({
          tenant_id: tenantId,
          provider: "bling",
          config,
          is_active: true,
          sync_status: "idle",
        });
      }

      // Redirect to settings page
      const appUrl = Deno.env.get("APP_URL") || "https://warm-retention.lovable.app";
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings/integrations/bling?connected=true` },
      });
    }

    // Step 3: Refresh — called by cron or manually
    if (action === "refresh") {
      const { data: integrations, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("provider", "bling")
        .eq("is_active", true);

      if (error) throw error;

      let refreshed = 0;
      let errors = 0;

      for (const integration of integrations || []) {
        const cfg = integration.config as any;
        if (!cfg?.refresh_token) continue;

        // Refresh if access token expires in less than 2 hours
        const expiresAt = new Date(cfg.access_expires_at).getTime();
        const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;

        if (expiresAt > twoHoursFromNow) continue;

        try {
          const credentials = btoa(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`);
          const tokenRes = await fetch(BLING_TOKEN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${credentials}`,
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: cfg.refresh_token,
            }),
          });

          const tokenData = await tokenRes.json();

          if (!tokenRes.ok) {
            console.error(`Bling refresh error for ${integration.id}:`, tokenData);
            await supabase.from("integrations").update({
              sync_error: `Refresh failed: ${tokenData.error?.message || JSON.stringify(tokenData)}`,
              updated_at: new Date().toISOString(),
            }).eq("id", integration.id);
            errors++;
            continue;
          }

          const now = new Date();
          const newConfig = {
            ...cfg,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            access_expires_at: new Date(now.getTime() + (tokenData.expires_in || 21600) * 1000).toISOString(),
            refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          };

          await supabase.from("integrations").update({
            config: newConfig,
            sync_error: null,
            updated_at: now.toISOString(),
          }).eq("id", integration.id);

          refreshed++;
        } catch (err) {
          console.error(`Bling refresh exception for ${integration.id}:`, err);
          errors++;
        }
      }

      return new Response(JSON.stringify({ refreshed, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Disconnect
    if (action === "disconnect") {
      const body = await req.json();
      const tenantId = body.tenant_id;
      if (!tenantId) {
        return new Response(JSON.stringify({ error: "tenant_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("integrations")
        .update({ is_active: false, config: {}, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("provider", "bling");

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bling-auth error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
