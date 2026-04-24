import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const META_APP_ID = (Deno.env.get("META_APP_ID") ?? "").trim();
const META_APP_SECRET = (Deno.env.get("META_APP_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function validateMetaAppId(): { ok: true } | { ok: false; error: string; diagnostics: Record<string, unknown> } {
  const diagnostics = {
    meta_app_id_present: META_APP_ID.length > 0,
    meta_app_id_length: META_APP_ID.length,
    meta_app_id_is_numeric: /^\d+$/.test(META_APP_ID),
    meta_app_id_preview: META_APP_ID ? `${META_APP_ID.slice(0, 4)}…${META_APP_ID.slice(-4)}` : null,
    meta_app_secret_present: META_APP_SECRET.length > 0,
    meta_app_secret_length: META_APP_SECRET.length,
  };
  if (!META_APP_ID) return { ok: false, error: "META_APP_ID ausente nas secrets do backend", diagnostics };
  if (!/^\d+$/.test(META_APP_ID)) return { ok: false, error: "META_APP_ID inválido: precisa ser numérico (apenas dígitos)", diagnostics };
  if (!META_APP_SECRET) return { ok: false, error: "META_APP_SECRET ausente nas secrets do backend", diagnostics };
  return { ok: true };
}

// Required scopes for IG DMs + comments + lives
const SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_show_list",
  "business_management",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "start";

    // ── 1. START: returns the Meta OAuth URL the frontend should redirect to ──
    if (action === "start") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing auth" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const tenant_id = body.tenant_id;
      const redirect_uri = body.redirect_uri || `${url.origin}/settings/instagram`;

      if (!tenant_id) {
        return new Response(JSON.stringify({ error: "tenant_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate Meta App credentials BEFORE building OAuth URL
      const validation = validateMetaAppId();
      if (!validation.ok) {
        console.error("[instagram-register] Invalid Meta config:", validation.diagnostics);
        return new Response(
          JSON.stringify({
            error: validation.error,
            diagnostics: validation.diagnostics,
            redirect_uri,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // state encodes tenant_id + user_id so callback can resolve
      const state = btoa(JSON.stringify({ tenant_id, user_id: user.id, ts: Date.now() }));

      const oauthUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth");
      oauthUrl.searchParams.set("client_id", META_APP_ID);
      oauthUrl.searchParams.set("redirect_uri", redirect_uri);
      oauthUrl.searchParams.set("scope", SCOPES);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("state", state);

      console.log("[instagram-register] OAuth URL built:", {
        client_id_length: META_APP_ID.length,
        client_id_preview: `${META_APP_ID.slice(0, 4)}…${META_APP_ID.slice(-4)}`,
        redirect_uri,
        scopes_count: SCOPES.split(",").length,
      });

      return new Response(
        JSON.stringify({
          oauth_url: oauthUrl.toString(),
          diagnostics: {
            meta_app_id: META_APP_ID,
            meta_app_id_length: META_APP_ID.length,
            meta_app_id_is_numeric: /^\d+$/.test(META_APP_ID),
            redirect_uri,
            scopes: SCOPES.split(","),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. CALLBACK: exchange code → token, list pages, save IG accounts ──
    if (action === "callback") {
      const body = await req.json();
      const { code, state, redirect_uri } = body;

      if (!code || !state) {
        return new Response(JSON.stringify({ error: "code and state required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const decoded = JSON.parse(atob(state));
      const tenant_id = decoded.tenant_id;

      // Exchange code for short-lived user token
      const tokenUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", META_APP_ID);
      tokenUrl.searchParams.set("client_secret", META_APP_SECRET);
      tokenUrl.searchParams.set("redirect_uri", redirect_uri);
      tokenUrl.searchParams.set("code", code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("token exchange failed:", tokenData);
        return new Response(JSON.stringify({ error: "Token exchange failed", details: tokenData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange to long-lived user token (60d)
      const longUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", META_APP_ID);
      longUrl.searchParams.set("client_secret", META_APP_SECRET);
      longUrl.searchParams.set("fb_exchange_token", tokenData.access_token);

      const longRes = await fetch(longUrl.toString());
      const longData = await longRes.json();
      const userToken = longData.access_token || tokenData.access_token;

      // Get user pages with IG accounts
      const pagesRes = await fetch(
        `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${userToken}`
      );
      const pagesData = await pagesRes.json();
      if (!pagesRes.ok) {
        console.error("pages fetch failed:", pagesData);
        return new Response(JSON.stringify({ error: "Failed to list pages", details: pagesData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      const accountsSaved: any[] = [];
      const pagesWithoutIG: any[] = [];

      for (const page of pagesData.data || []) {
        if (!page.instagram_business_account) {
          pagesWithoutIG.push({ id: page.id, name: page.name });
          continue;
        }
        const ig = page.instagram_business_account;
        // Subscribe page to webhook fields
        try {
          await fetch(
            `https://graph.facebook.com/v22.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,comments,live_comments,mentions&access_token=${page.access_token}`,
            { method: "POST" }
          );
        } catch (e) {
          console.error("subscribe page failed:", page.id, e);
        }

        const { data: saved, error: saveErr } = await supabase
          .from("instagram_accounts")
          .upsert(
            {
              tenant_id,
              ig_user_id: ig.id,
              username: ig.username,
              page_id: page.id,
              page_name: page.name,
              access_token: page.access_token,
              token_expires_at: expiresAt.toISOString(),
              profile_picture_url: ig.profile_picture_url,
              followers_count: ig.followers_count,
              is_active: true,
            },
            { onConflict: "tenant_id,ig_user_id" }
          )
          .select()
          .single();

        if (saveErr) {
          console.error("save IG account failed:", saveErr);
        } else {
          accountsSaved.push(saved);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          accounts_connected: accountsSaved.length,
          accounts: accountsSaved,
          pages_without_ig: pagesWithoutIG,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. UPDATE_TOKEN: validate & store a manually-pasted long-lived token ──
    if (action === "update_token") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing auth" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const ig_account_id: string | undefined = body.ig_account_id;
      const access_token: string | undefined = (body.access_token || "").trim();

      if (!ig_account_id || !access_token || access_token.length < 30) {
        return new Response(JSON.stringify({ error: "ig_account_id and valid access_token required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Confirm caller is a member of the account's tenant
      const { data: acc, error: accErr } = await supabase
        .from("instagram_accounts")
        .select("id, tenant_id, ig_user_id, page_id")
        .eq("id", ig_account_id)
        .single();
      if (accErr || !acc) {
        return new Response(JSON.stringify({ error: "Account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: membership } = await supabase
        .from("tenant_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", acc.tenant_id)
        .maybeSingle();
      if (!membership) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate token + refresh metadata via Graph API
      const meRes = await fetch(
        `https://graph.facebook.com/v22.0/${acc.ig_user_id}?fields=id,username,profile_picture_url,followers_count&access_token=${access_token}`
      );
      const meData = await meRes.json();
      if (!meRes.ok) {
        return new Response(JSON.stringify({ error: "Invalid token", details: meData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try to inspect token to get real expiry; default to 60d
      let expiresAtIso: string;
      try {
        const dbgRes = await fetch(
          `https://graph.facebook.com/v22.0/debug_token?input_token=${access_token}&access_token=${META_APP_ID}|${META_APP_SECRET}`
        );
        const dbg = await dbgRes.json();
        const expSec = dbg?.data?.expires_at;
        if (expSec && typeof expSec === "number" && expSec > 0) {
          expiresAtIso = new Date(expSec * 1000).toISOString();
        } else {
          const d = new Date();
          d.setDate(d.getDate() + 60);
          expiresAtIso = d.toISOString();
        }
      } catch {
        const d = new Date();
        d.setDate(d.getDate() + 60);
        expiresAtIso = d.toISOString();
      }

      const { error: upErr } = await supabase
        .from("instagram_accounts")
        .update({
          access_token,
          token_expires_at: expiresAtIso,
          username: meData.username ?? undefined,
          profile_picture_url: meData.profile_picture_url ?? undefined,
          followers_count: meData.followers_count ?? undefined,
          is_active: true,
        })
        .eq("id", ig_account_id);

      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Re-subscribe the page to webhook fields (best effort)
      try {
        await fetch(
          `https://graph.facebook.com/v22.0/${acc.page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,comments,live_comments,mentions&access_token=${access_token}`,
          { method: "POST" }
        );
      } catch (e) {
        console.warn("[instagram-register] re-subscribe failed:", e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          username: meData.username,
          token_expires_at: expiresAtIso,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("instagram-register error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
