// Cron job (a cada 30s): para cada conta IG com Live ativa e auto_reply_lives,
// busca novos comentários da Live na Graph API e dispara auto-resposta via instagram-send.
// Aplica filtros anti-spam: <3 chars, dedup 60s mesmo usuário, rate 1/5s por conta.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GRAPH = "https://graph.facebook.com/v22.0";

interface LiveComment {
  id: string;
  text?: string;
  from?: { id?: string; username?: string };
  timestamp?: string;
}

async function fetchLiveComments(liveId: string, token: string): Promise<LiveComment[]> {
  // Live Video comments edge
  const url = `${GRAPH}/${liveId}/comments?fields=id,text,from,timestamp&access_token=${token}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[live-poller] failed to fetch comments", liveId, res.status, await res.text());
    return [];
  }
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

async function callInstagramSend(payload: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

const SPAM_PATTERNS = [
  /https?:\/\//i,
  /\bcompr[ae]\b.*\bbarato\b/i,
  /\bvi[sz]ita\b/i,
  /\bfollow\b.*\bback\b/i,
];

function looksLikeSpam(text: string) {
  return SPAM_PATTERNS.some((re) => re.test(text));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // optional cron auth
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") || "";
    const x = req.headers.get("x-cron-secret") || "";
    if (!auth.includes(CRON_SECRET) && x !== CRON_SECRET) {
      // allow service role too
      if (!auth.includes(SUPABASE_SERVICE_ROLE_KEY)) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  const { data: accounts, error } = await supabase
    .from("instagram_accounts")
    .select("id, tenant_id, ig_user_id, access_token, live_active_id, auto_reply_lives")
    .eq("is_active", true)
    .eq("auto_reply_lives", true)
    .not("live_active_id", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary: Record<string, number> = {};
  let totalReplies = 0;

  for (const acc of accounts || []) {
    if (!acc.access_token || !acc.live_active_id) continue;

    const comments = await fetchLiveComments(acc.live_active_id, acc.access_token);
    if (!comments.length) continue;

    // upsert each comment, then process new ones
    const newOnes: LiveComment[] = [];
    for (const c of comments) {
      const { data: existing } = await supabase
        .from("instagram_live_comments")
        .select("id")
        .eq("ig_account_id", acc.id)
        .eq("comment_id", c.id)
        .maybeSingle();

      if (existing) continue;

      await supabase.from("instagram_live_comments").insert({
        tenant_id: acc.tenant_id,
        ig_account_id: acc.id,
        live_id: acc.live_active_id,
        comment_id: c.id,
        from_username: c.from?.username || null,
        from_ig_user_id: c.from?.id || null,
        content: c.text || null,
        auto_replied: false,
        metadata: { timestamp: c.timestamp },
      });

      newOnes.push(c);
    }

    if (!newOnes.length) continue;

    // dedup window: don't reply to same user twice in 60s
    let perAccountReplied = 0;
    const lastByUser = new Map<string, number>();

    for (const c of newOnes) {
      const text = (c.text || "").trim();
      if (text.length < 3) continue;
      if (looksLikeSpam(text)) continue;

      const userKey = c.from?.id || c.from?.username || "anon";
      const now = Date.now();
      const lastTs = lastByUser.get(userKey) || 0;
      if (now - lastTs < 60_000) continue;

      // also check DB for last 60s
      const sinceIso = new Date(now - 60_000).toISOString();
      const { count } = await supabase
        .from("instagram_live_comments")
        .select("id", { count: "exact", head: true })
        .eq("ig_account_id", acc.id)
        .eq("from_ig_user_id", userKey)
        .eq("auto_replied", true)
        .gte("created_at", sinceIso);
      if ((count ?? 0) > 0) continue;

      // rate limit per account: 1 reply / 5s
      if (perAccountReplied > 0) await new Promise((r) => setTimeout(r, 5000));

      const ok = await callInstagramSend({
        type: "live_reply",
        ig_account_id: acc.id,
        live_id: acc.live_active_id,
        comment_id: c.id,
        from_username: c.from?.username,
        incoming: text,
        use_copilot: true,
      });

      if (ok) {
        await supabase
          .from("instagram_live_comments")
          .update({ auto_replied: true, reply_status: "sent" })
          .eq("ig_account_id", acc.id)
          .eq("comment_id", c.id);
        lastByUser.set(userKey, Date.now());
        perAccountReplied += 1;
        totalReplies += 1;
      }
    }

    summary[acc.id] = perAccountReplied;
  }

  return new Response(
    JSON.stringify({ ok: true, totalReplies, perAccount: summary }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
