import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SCOPES = "read_orders,read_customers,read_products,read_draft_orders,read_inventory,read_fulfillments";
const SHOPIFY_API_VERSION = "2025-01";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FALLBACK_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") || "";
  const FALLBACK_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") || "";
  // App servido com base "/crm/" (vite + BrowserRouter basename "/crm");
  // redirect pós-OAuth precisa do prefixo /crm senão tela branca.
  const APP_URL = Deno.env.get("APP_URL") || "https://maxfem.tech/crm";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/shopify-auth?action=callback`;

  async function loadIntegration(tenantId: string) {
    const { data } = await supabase
      .from("integrations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("provider", "shopify")
      .maybeSingle();
    return data;
  }

  function pickCreds(cfg: Record<string, unknown> | null | undefined) {
    const config = cfg || {};
    return {
      client_id: (config["client_id"] as string) || FALLBACK_CLIENT_ID,
      client_secret: (config["client_secret"] as string) || FALLBACK_CLIENT_SECRET,
      shop_domain: (config["shop_domain"] as string) || "",
    };
  }

  // Shopify exige domínio normalizado tipo "maxfem.myshopify.com"
  function normalizeShopDomain(raw: string): string | null {
    if (!raw) return null;
    let s = raw.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!s.endsWith(".myshopify.com")) {
      // Aceita só o subdomínio (ex: "maxfem")
      if (/^[a-z0-9][a-z0-9-]*$/.test(s)) {
        s = `${s}.myshopify.com`;
      } else {
        return null;
      }
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return null;
    return s;
  }

  // HMAC verification (Shopify usa SHA-256 com client_secret)
  async function verifyHmac(params: URLSearchParams, secret: string): Promise<boolean> {
    const hmacReceived = params.get("hmac");
    if (!hmacReceived) return false;
    const entries: [string, string][] = [];
    params.forEach((v, k) => {
      if (k !== "hmac" && k !== "signature") entries.push([k, v]);
    });
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const message = entries.map(([k, v]) => `${k}=${v}`).join("&");

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Timing-safe compare
    if (computed.length !== hmacReceived.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ hmacReceived.charCodeAt(i);
    }
    return diff === 0;
  }

  try {
    // Step 1 — Authorize
    if (action === "authorize") {
      const tenantId = url.searchParams.get("tenant_id");
      const shopParam = url.searchParams.get("shop");
      if (!tenantId) return jsonError(400, "tenant_id required");

      const integration = await loadIntegration(tenantId);
      const creds = pickCreds(integration?.config as any);
      const shopDomain = normalizeShopDomain(shopParam || creds.shop_domain);

      if (!creds.client_id) return htmlError(400, "Cole client_id e client_secret antes de conectar.");
      if (!shopDomain) return htmlError(400, "Informe o domínio da loja Shopify (ex: maxfem.myshopify.com).");

      const scope = ((integration?.config as any)?.scopes as string) || DEFAULT_SCOPES;
      const nonce = crypto.randomUUID();
      // state codifica tenant + nonce pra validar no callback
      const state = `${tenantId}:${nonce}`;

      // Persiste nonce + shop_domain pra validar no callback
      const newCfg = {
        ...((integration?.config as any) || {}),
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        shop_domain: shopDomain,
        oauth_nonce: nonce,
        scopes: scope,
      };
      if (integration) {
        await supabase
          .from("integrations")
          .update({ config: newCfg, updated_at: new Date().toISOString() })
          .eq("id", integration.id);
      } else {
        await supabase.from("integrations").insert({
          tenant_id: tenantId,
          provider: "shopify",
          config: newCfg,
          is_active: false,
          sync_status: "idle",
        });
      }

      const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${encodeURIComponent(creds.client_id)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(state)}&grant_options[]=`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authUrl } });
    }

    // Step 2 — Callback
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state") || "";
      const shopReturned = url.searchParams.get("shop") || "";
      const errParam = url.searchParams.get("error");

      if (errParam) {
        return redirectToApp(APP_URL, `error=${encodeURIComponent(errParam)}`);
      }
      if (!code || !stateParam) return htmlError(400, "Missing code or state");

      const [tenantId, nonce] = stateParam.split(":");
      if (!tenantId || !nonce) return htmlError(400, "Invalid state");

      const integration = await loadIntegration(tenantId);
      const creds = pickCreds(integration?.config as any);
      const savedNonce = (integration?.config as any)?.oauth_nonce;
      const savedShop = (integration?.config as any)?.shop_domain;

      if (!creds.client_id || !creds.client_secret) {
        return redirectToApp(APP_URL, "error=" + encodeURIComponent("client_id/secret não configurados"));
      }
      if (savedNonce !== nonce) {
        return redirectToApp(APP_URL, "error=" + encodeURIComponent("nonce inválido (CSRF)"));
      }
      const shopDomain = normalizeShopDomain(shopReturned) || savedShop;
      if (!shopDomain || shopDomain !== savedShop) {
        return redirectToApp(APP_URL, "error=" + encodeURIComponent("shop domain divergente"));
      }

      // Verifica HMAC do Shopify
      const hmacOk = await verifyHmac(url.searchParams, creds.client_secret);
      if (!hmacOk) {
        return redirectToApp(APP_URL, "error=" + encodeURIComponent("HMAC inválido"));
      }

      // Troca code por access_token
      const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          code,
        }),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error("Shopify token error:", tokenRes.status, tokenData);
        return redirectToApp(APP_URL, "error=" + encodeURIComponent(tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`));
      }

      const now = new Date();
      const newConfig = {
        ...((integration?.config as any) || {}),
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        shop_domain: shopDomain,
        access_token: tokenData.access_token,
        scope: tokenData.scope || "",
        api_version: SHOPIFY_API_VERSION,
        connected_at: now.toISOString(),
        oauth_nonce: null,
      };

      if (integration) {
        await supabase
          .from("integrations")
          .update({ config: newConfig, is_active: true, sync_status: "idle", sync_error: null, updated_at: now.toISOString() })
          .eq("id", integration.id);
      } else {
        await supabase.from("integrations").insert({
          tenant_id: tenantId,
          provider: "shopify",
          config: newConfig,
          is_active: true,
          sync_status: "idle",
        });
      }

      return redirectToApp(APP_URL, "connected=true");
    }

    // Step 3 — Test connection (chama /shop.json pra validar token)
    if (action === "test") {
      const body = await req.json().catch(() => ({}));
      const tenantId = body.tenant_id;
      if (!tenantId) return jsonError(400, "tenant_id required");

      const integration = await loadIntegration(tenantId);
      const cfg = (integration?.config as any) || {};
      if (!cfg.access_token || !cfg.shop_domain) {
        return jsonError(400, "Não conectado");
      }

      const apiVersion = cfg.api_version || SHOPIFY_API_VERSION;
      const res = await fetch(`https://${cfg.shop_domain}/admin/api/${apiVersion}/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": cfg.access_token,
          Accept: "application/json",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await supabase.from("integrations").update({
          sync_error: `Test failed: HTTP ${res.status}`,
          updated_at: new Date().toISOString(),
        }).eq("id", integration!.id);
        return jsonError(res.status, data?.errors || `HTTP ${res.status}`);
      }

      return jsonOk({ ok: true, shop: data.shop });
    }

    // Step 4 — Disconnect
    if (action === "disconnect") {
      const body = await req.json().catch(() => ({}));
      const tenantId = body.tenant_id;
      if (!tenantId) return jsonError(400, "tenant_id required");

      const integration = await loadIntegration(tenantId);
      const cfg = (integration?.config as any) || {};
      // Mantém credenciais e shop_domain pra reconectar fácil
      const cleanConfig = {
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        shop_domain: cfg.shop_domain,
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
        .eq("provider", "shopify");

      return jsonOk({ ok: true });
    }

    return jsonError(400, "Invalid action");
  } catch (err: any) {
    console.error("shopify-auth error:", err);
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
  return new Response(`<h1>Shopify OAuth · erro</h1><p>${message}</p>`, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}
function redirectToApp(appUrl: string, queryString: string) {
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: `${appUrl}/settings/integrations/shopify?${queryString}`,
    },
  });
}
