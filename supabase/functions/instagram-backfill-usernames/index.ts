import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchIgUsername(
  igUserId: string,
  accessToken: string,
  ownerIgUserId?: string,
): Promise<string | null> {
  const isInstagramLoginToken = accessToken.startsWith("IGAA");

  const endpoints = isInstagramLoginToken
    ? [
        `https://graph.instagram.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
        `https://graph.facebook.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
      ]
    : [
        `https://graph.facebook.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
        `https://graph.instagram.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
      ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && (data.username || data.name)) {
        return data.username || data.name;
      }
    } catch (_e) {
      // continue
    }
  }

  // Fallback: list conversations and look for matching participant
  if (ownerIgUserId) {
    try {
      const base = isInstagramLoginToken
        ? "https://graph.instagram.com/v22.0"
        : "https://graph.facebook.com/v22.0";
      const url = `${base}/${ownerIgUserId}/conversations?platform=instagram&fields=participants&access_token=${accessToken}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && Array.isArray(data?.data)) {
        for (const conv of data.data) {
          const part = conv?.participants?.data?.find((p: any) => p.id === igUserId);
          if (part?.username) return part.username;
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  return null;
}

async function backfillForAccount(account: any) {
  if (!account?.access_token) return { resolved: 0, scanned: 0 };

  const { data: rows } = await supabase
    .from("instagram_messages")
    .select("ig_user_id")
    .eq("ig_account_id", account.id)
    .is("username", null)
    .limit(5000);

  const uniqueIds = Array.from(
    new Set((rows || []).map((r: any) => r.ig_user_id)),
  ).filter((id) => id && id !== account.ig_user_id);

  let resolved = 0;
  const concurrency = 3;

  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const chunk = uniqueIds.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (igUserId) => {
        const username = await fetchIgUsername(
          igUserId,
          account.access_token,
          account.ig_user_id,
        );
        if (!username) return;
        resolved++;

        await supabase
          .from("instagram_messages")
          .update({ username })
          .eq("ig_account_id", account.id)
          .eq("ig_user_id", igUserId)
          .is("username", null);

        const { data: cust } = await supabase
          .from("customers")
          .select("id, name, custom_attributes")
          .eq("tenant_id", account.tenant_id)
          .filter("custom_attributes->instagram->>ig_user_id", "eq", igUserId)
          .limit(1)
          .maybeSingle();

        if (cust && (cust.name?.startsWith("IG ") || !cust.name)) {
          const attrs = (cust.custom_attributes as any) || {};
          await supabase
            .from("customers")
            .update({
              name: `@${username}`,
              custom_attributes: {
                ...attrs,
                instagram: {
                  ...(attrs.instagram || {}),
                  ig_user_id: igUserId,
                  username,
                },
              },
            })
            .eq("id", cust.id);
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 200));
  }

  return { resolved, scanned: uniqueIds.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supaAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supaAuth.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: user.id,
      _tenant_id: tenantId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: accounts } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    let totalResolved = 0;
    let totalScanned = 0;
    const perAccount: any[] = [];

    for (const account of accounts || []) {
      const result = await backfillForAccount(account);
      totalResolved += result.resolved;
      totalScanned += result.scanned;
      perAccount.push({
        ig_user_id: account.ig_user_id,
        username: account.username,
        ...result,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_resolved: totalResolved,
        total_scanned: totalScanned,
        accounts: perAccount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[ig-backfill-usernames] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
