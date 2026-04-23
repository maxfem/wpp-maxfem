// Cron diário: renova access_token de instagram_accounts cujo token expira em ≤7 dias.
// Usa Graph API endpoint de refresh de long-lived token.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_ID = Deno.env.get("META_APP_ID")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GRAPH = "https://graph.facebook.com/v22.0";

async function refreshLongLivedToken(token: string): Promise<{ access_token: string; expires_in: number } | null> {
  // Page tokens herdados de long-lived user token; renovamos via fb_exchange_token
  const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[token-refresh] exchange failed", res.status, await res.text());
    return null;
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") || "";
    const x = req.headers.get("x-cron-secret") || "";
    if (!auth.includes(CRON_SECRET) && x !== CRON_SECRET && !auth.includes(SUPABASE_SERVICE_ROLE_KEY)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // contas com token a expirar em ≤7 dias OU sem expires_at registrado (legado)
  const { data: accounts, error } = await supabase
    .from("instagram_accounts")
    .select("id, access_token, token_expires_at")
    .eq("is_active", true)
    .or(`token_expires_at.lte.${sevenDaysFromNow},token_expires_at.is.null`);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const acc of accounts || []) {
    if (!acc.access_token) {
      results.push({ id: acc.id, ok: false, error: "no token" });
      continue;
    }

    const refreshed = await refreshLongLivedToken(acc.access_token);
    if (!refreshed?.access_token) {
      results.push({ id: acc.id, ok: false, error: "exchange failed" });
      continue;
    }

    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const { error: upErr } = await supabase
      .from("instagram_accounts")
      .update({
        access_token: refreshed.access_token,
        token_expires_at: expiresAt,
      })
      .eq("id", acc.id);

    results.push({ id: acc.id, ok: !upErr, error: upErr?.message });
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
