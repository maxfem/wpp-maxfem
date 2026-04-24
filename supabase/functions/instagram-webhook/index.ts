import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!; // reuse same verify token as WA
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── helpers ────────────────────────────────────────────────────────────
async function findAccountByIgUserId(igUserId: string) {
  const { data } = await supabase
    .from("instagram_accounts")
    .select("*")
    .eq("ig_user_id", igUserId)
    .eq("is_active", true)
    .limit(1)
    .single();
  return data;
}

async function findAccountByPageId(pageId: string) {
  const { data } = await supabase
    .from("instagram_accounts")
    .select("*")
    .eq("page_id", pageId)
    .eq("is_active", true)
    .limit(1)
    .single();
  return data;
}

// Fetch IG username from Meta Graph API for a given IG-Scoped User ID.
// Tries multiple endpoints — works for both Instagram Login (IGAA) and Facebook Page (EAA) tokens.
async function fetchIgUsername(
  igUserId: string,
  accessToken: string,
  ownerIgUserId?: string,
): Promise<string | null> {
  const isInstagramLoginToken = accessToken.startsWith("IGAA");

  // Build endpoint list in order of likelihood of success based on token type
  const endpoints = isInstagramLoginToken
    ? [
        // Instagram Login token (IGAA) — must use graph.instagram.com
        `https://graph.instagram.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
        // Fallback to graph.facebook.com (sometimes accepted)
        `https://graph.facebook.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
      ]
    : [
        // Facebook Page token (EAA) — primary
        `https://graph.facebook.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
        `https://graph.instagram.com/v22.0/${igUserId}?fields=username,name&access_token=${accessToken}`,
      ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && (data.username || data.name)) {
        const handle = data.username || data.name;
        console.log(`[ig-webhook] fetchIgUsername OK (${url.split("?")[0]}) → ${handle}`);
        return handle;
      }
      console.warn(`[ig-webhook] fetchIgUsername miss ${url.split("?")[0]}:`, data?.error?.message || data);
    } catch (e) {
      console.error("[ig-webhook] fetchIgUsername error:", e);
    }
  }

  // Last resort: list conversations and look for matching participant
  if (ownerIgUserId) {
    try {
      const base = isInstagramLoginToken
        ? "https://graph.instagram.com/v22.0"
        : "https://graph.facebook.com/v22.0";
      const url = `${base}/${ownerIgUserId}/conversations?platform=instagram&fields=participants&access_token=${accessToken}&limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && Array.isArray(data?.data)) {
        for (const conv of data.data) {
          const part = conv?.participants?.data?.find((p: any) => p.id === igUserId);
          if (part?.username) {
            console.log(`[ig-webhook] fetchIgUsername via conversations → ${part.username}`);
            return part.username;
          }
        }
      } else {
        console.warn("[ig-webhook] conversations fallback miss:", data?.error?.message || data);
      }
    } catch (e) {
      console.error("[ig-webhook] conversations fallback error:", e);
    }
  }

  return null;
}

// Backfill usernames for an account: scan distinct ig_user_ids missing username and resolve them.
async function backfillUsernamesForAccount(account: any): Promise<{ resolved: number; scanned: number }> {
  if (!account?.access_token) return { resolved: 0, scanned: 0 };

  const { data: rows } = await supabase
    .from("instagram_messages")
    .select("ig_user_id")
    .eq("ig_account_id", account.id)
    .is("username", null)
    .limit(2000);

  const uniqueIds = Array.from(new Set((rows || []).map((r: any) => r.ig_user_id))).filter(
    (id) => id && id !== account.ig_user_id,
  );

  let resolved = 0;
  // Process in small batches to respect rate limits
  const concurrency = 3;
  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const chunk = uniqueIds.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (igUserId) => {
        const username = await fetchIgUsername(igUserId, account.access_token, account.ig_user_id);
        if (!username) return;
        resolved++;
        // update messages
        await supabase
          .from("instagram_messages")
          .update({ username })
          .eq("ig_account_id", account.id)
          .eq("ig_user_id", igUserId)
          .is("username", null);
        // update customer name if placeholder
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
                instagram: { ...(attrs.instagram || {}), ig_user_id: igUserId, username },
              },
            })
            .eq("id", cust.id);
        }
      }),
    );
    // small pause between batches
    await new Promise((r) => setTimeout(r, 200));
  }

  return { resolved, scanned: uniqueIds.length };
}

async function resolveCustomerByIgUser(
  tenantId: string,
  igUserId: string,
  username?: string | null
) {
  // try lookup by custom_attributes->instagram->ig_user_id
  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, custom_attributes")
    .eq("tenant_id", tenantId)
    .filter("custom_attributes->instagram->>ig_user_id", "eq", igUserId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Backfill username if we now have it and the existing record was a placeholder
    const attrs = (existing.custom_attributes as any) || {};
    const currentUsername = attrs?.instagram?.username;
    if (username && (!currentUsername || existing.name?.startsWith("IG "))) {
      await supabase
        .from("customers")
        .update({
          name: `@${username}`,
          custom_attributes: {
            ...attrs,
            instagram: { ...(attrs.instagram || {}), ig_user_id: igUserId, username },
          },
        })
        .eq("id", existing.id);
    }
    return existing;
  }

  // create new customer
  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: tenantId,
      name: username ? `@${username}` : `IG ${igUserId.slice(-6)}`,
      custom_attributes: { instagram: { ig_user_id: igUserId, username } },
      is_lead: true,
    })
    .select()
    .single();
  if (error) console.error("[ig-webhook] create customer failed:", error);
  return created;
}

// ── Comment-Rules engine (ManyChat-style) ─────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchesKeywords(rule: any, text: string): { ok: boolean; term?: string } {
  const content = normalize(text);
  if (!content) return { ok: false };
  const kws = (rule.keywords || []) as string[];
  for (const raw of kws) {
    const k = normalize(raw);
    if (!k) continue;
    if (rule.match_mode === "exact") {
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(content)) return { ok: true, term: raw };
    } else {
      if (content.includes(k)) return { ok: true, term: raw };
    }
  }
  return { ok: false };
}

async function aiIntentMatch(rule: any, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return false;
  try {
    const sys = `Você é um classificador binário. Decida se o COMENTÁRIO indica a mesma intenção da REGRA. Responda SOMENTE com "yes" ou "no".\nREGRA: ${rule.name}\nPALAVRAS-CHAVE: ${(rule.keywords || []).join(", ")}\nRESPOSTA PÚBLICA DA REGRA: ${rule.public_reply_text}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const ans = (data.choices?.[0]?.message?.content || "").toLowerCase().trim();
    return ans.startsWith("y");
  } catch (e) {
    console.error("[ig-webhook] aiIntentMatch error:", e);
    return false;
  }
}

async function evaluateAndRunRules(opts: {
  account: any;
  channel: "comment" | "live";
  text: string;
  comment_id: string;
  post_id?: string;
  from_ig_user_id?: string;
  from_username?: string;
  permalink?: string;
}): Promise<boolean> {
  const { account, channel, text, comment_id, post_id, from_ig_user_id, from_username, permalink } = opts;
  if (!text) return false;

  const { data: rules } = await supabase
    .from("instagram_comment_rules")
    .select("*")
    .eq("ig_account_id", account.id)
    .eq("is_active", true);

  if (!rules || rules.length === 0) return false;

  // Filter by scope
  const candidates = rules.filter((r: any) => {
    if (r.scope === "all") return true;
    if (r.scope === "posts") return channel === "comment";
    if (r.scope === "lives") return channel === "live";
    if (r.scope === "specific")
      return channel === "comment" && post_id && (r.post_ids || []).includes(post_id);
    return false;
  });

  for (const rule of candidates) {
    // Dedup
    const { data: existing } = await supabase
      .from("instagram_rule_executions")
      .select("id")
      .eq("rule_id", rule.id)
      .eq("comment_id", comment_id)
      .maybeSingle();
    if (existing) continue;

    // Match
    let matched_by: "keyword" | "ai" | null = null;
    let matched_term: string | undefined;
    const kw = matchesKeywords(rule, text);
    if (kw.ok) {
      matched_by = "keyword";
      matched_term = kw.term;
    } else if (rule.use_ai_intent) {
      const ai = await aiIntentMatch(rule, text);
      if (ai) matched_by = "ai";
    }
    if (!matched_by) continue;

    // Cooldown / daily limit per user
    if (from_ig_user_id) {
      const since = new Date(Date.now() - (rule.cooldown_seconds || 60) * 1000).toISOString();
      const { data: recent } = await supabase
        .from("instagram_rule_executions")
        .select("id")
        .eq("rule_id", rule.id)
        .eq("from_ig_user_id", from_ig_user_id)
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("instagram_rule_executions")
        .select("*", { count: "exact", head: true })
        .eq("rule_id", rule.id)
        .eq("from_ig_user_id", from_ig_user_id)
        .gte("created_at", dayStart.toISOString());
      if ((count || 0) >= (rule.daily_limit_per_user || 3)) continue;
    }

    // Fire rule via instagram-send (mode rule_reply)
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/instagram-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          mode: "rule_reply",
          tenant_id: account.tenant_id,
          ig_account_id: account.id,
          rule_id: rule.id,
          channel,
          comment_id,
          post_id,
          from_ig_user_id,
          from_username,
          matched_by,
          matched_term,
          context: { permalink, post_id },
        }),
      });
      return true; // first matching rule wins
    } catch (e) {
      console.error("[ig-webhook] rule fire failed:", e);
    }
  }
  return false;
}

async function triggerCopilotReply(params: {
  tenantId: string;
  ig_account_id: string;
  ig_user_id: string;
  username?: string;
  text: string;
  channel: "dm" | "comment" | "live";
  comment_id?: string;
  context?: any;
}) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/instagram-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        mode: "auto_reply",
        tenant_id: params.tenantId,
        ig_account_id: params.ig_account_id,
        ig_user_id: params.ig_user_id,
        username: params.username,
        incoming_text: params.text,
        channel: params.channel,
        comment_id: params.comment_id,
        context: params.context,
      }),
    });
  } catch (e) {
    console.error("[ig-webhook] copilot trigger failed:", e);
  }
}

// ── handlers ───────────────────────────────────────────────────────────
async function handleMessaging(entry: any) {
  // entry.id = page id
  const account = await findAccountByPageId(entry.id) || await findAccountByIgUserId(entry.id);
  if (!account) {
    console.warn("[ig-webhook] no IG account for page/ig id:", entry.id);
    return;
  }

  for (const event of entry.messaging || []) {
    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;
    if (!senderId) continue;

    // Inbound messages: sender is the user, recipient is our IG business account
    const isInbound = recipientId === account.ig_user_id;
    const igUserId = isInbound ? senderId : recipientId;

    if (event.message) {
      const msg = event.message;
      // Skip echoes of our own outbound (handled by send function)
      if (msg.is_echo) continue;

      // Try to resolve the username via Graph API (webhook payload doesn't include it).
      // Resolve for both inbound AND outbound (echo) so conversations started by us also get named.
      let resolvedUsername: string | null = null;
      if (account.access_token) {
        resolvedUsername = await fetchIgUsername(igUserId, account.access_token, account.ig_user_id);
      }

      const customer = await resolveCustomerByIgUser(
        account.tenant_id,
        igUserId,
        resolvedUsername
      );

      let content: string | null = msg.text || null;
      let messageType = "text";
      let mediaUrl: string | null = null;

      if (msg.attachments?.length) {
        const att = msg.attachments[0];
        let rawType = att.type || "attachment";
        mediaUrl = att.payload?.url || null;

        // Instagram returns "unsupported_type" for Story replies, shared posts/reels and
        // other rich media. The asset itself (lookaside.fbsbx.com) is almost always an
        // image preview that we *can* render — coerce it to "image" so the chat shows it.
        if (rawType === "unsupported_type" && mediaUrl) {
          rawType = "image";
        }
        // Normalise other IG-specific types to known renderable buckets
        if (rawType === "ig_reel" || rawType === "video") rawType = "video";
        if (rawType === "story_mention" || rawType === "share" || rawType === "image") rawType = "image";

        messageType = rawType;
        if (!content) {
          // Use a friendlier label per type so the conversation list isn't "[unsupported_type]"
          const labels: Record<string, string> = {
            image: "📷 Imagem",
            video: "🎬 Vídeo",
            audio: "🎵 Áudio",
            document: "📎 Documento",
          };
          content = labels[rawType] || `[${rawType}]`;
        }
      }

      const { data: inserted } = await supabase
        .from("instagram_messages")
        .insert({
          tenant_id: account.tenant_id,
          ig_account_id: account.id,
          customer_id: customer?.id || null,
          ig_user_id: igUserId,
          ig_conversation_id: event.thread_id || null,
          direction: isInbound ? "inbound" : "outbound",
          message_type: messageType,
          content,
          media_url: mediaUrl,
          status: isInbound ? "received" : "sent",
          message_id: msg.mid,
          username: resolvedUsername,
          metadata: msg,
        })
        .select()
        .single();

      console.log("[ig-webhook] message saved:", inserted?.id, "username:", resolvedUsername);

      // Backfill username on previous messages of this conversation that lacked it
      if (resolvedUsername) {
        await supabase
          .from("instagram_messages")
          .update({ username: resolvedUsername })
          .eq("ig_account_id", account.id)
          .eq("ig_user_id", igUserId)
          .is("username", null);
      }

      // Auto-reply DMs if enabled and inbound and within 24h (always within for fresh inbound)
      if (isInbound && account.auto_reply_dms && content) {
        await triggerCopilotReply({
          tenantId: account.tenant_id,
          ig_account_id: account.id,
          ig_user_id: igUserId,
          username: resolvedUsername || undefined,
          text: content,
          channel: "dm",
        });
      }
    }
  }
}

async function handleChanges(entry: any) {
  const account = await findAccountByPageId(entry.id) || await findAccountByIgUserId(entry.id);
  if (!account) return;

  for (const change of entry.changes || []) {
    const field = change.field;
    const value = change.value || {};

    // ── Comments on posts/Reels ──
    if (field === "comments") {
      const commentId = value.id;
      if (!commentId) continue;

      const fromUsername = value.from?.username;
      const fromIgId = value.from?.id;
      const text = value.text || "";
      const postId = value.media?.id || value.post_id;
      const parentId = value.parent_id;

      // ignore own replies
      if (fromIgId && fromIgId === account.ig_user_id) continue;

      const { data: inserted } = await supabase
        .from("instagram_comments")
        .upsert({
          tenant_id: account.tenant_id,
          ig_account_id: account.id,
          post_id: postId || "unknown",
          comment_id: commentId,
          parent_comment_id: parentId,
          from_username: fromUsername,
          from_ig_user_id: fromIgId,
          content: text,
          permalink: value.permalink,
          metadata: value,
        }, { onConflict: "comment_id" })
        .select()
        .single();

      console.log("[ig-webhook] comment saved:", inserted?.id);

      // 1) Try ManyChat-style rules first (keyword/AI → public reply + DM)
      let ruleFired = false;
      if (text && parentId == null) {
        ruleFired = await evaluateAndRunRules({
          account,
          channel: "comment",
          text,
          comment_id: commentId,
          post_id: postId,
          from_ig_user_id: fromIgId,
          from_username: fromUsername,
          permalink: value.permalink,
        });
      }

      // 2) Fallback to generic Copilot auto-reply only if no rule matched
      if (!ruleFired && account.auto_reply_comments && text) {
        await triggerCopilotReply({
          tenantId: account.tenant_id,
          ig_account_id: account.id,
          ig_user_id: fromIgId || "unknown",
          username: fromUsername,
          text,
          channel: "comment",
          comment_id: commentId,
          context: { post_id: postId, permalink: value.permalink },
        });
      }
    }

    // ── Live comments ──
    if (field === "live_comments") {
      const commentId = value.id;
      const liveId = value.live_id || value.media_id || "active";
      if (!commentId) continue;

      const fromUsername = value.from?.username;
      const fromIgId = value.from?.id;
      const text = value.text || "";
      if (fromIgId === account.ig_user_id) continue;

      // mark live as active on the account
      if (account.live_active_id !== liveId) {
        await supabase
          .from("instagram_accounts")
          .update({ live_active_id: liveId })
          .eq("id", account.id);
      }

      await supabase
        .from("instagram_live_comments")
        .upsert({
          tenant_id: account.tenant_id,
          ig_account_id: account.id,
          live_id: liveId,
          comment_id: commentId,
          from_username: fromUsername,
          from_ig_user_id: fromIgId,
          content: text,
          metadata: value,
        }, { onConflict: "comment_id" });

      // 1) Try ManyChat-style rules first for live comments
      let liveRuleFired = false;
      if (text) {
        liveRuleFired = await evaluateAndRunRules({
          account,
          channel: "live",
          text,
          comment_id: commentId,
          post_id: liveId,
          from_ig_user_id: fromIgId,
          from_username: fromUsername,
        });
        if (liveRuleFired) {
          await supabase
            .from("instagram_live_comments")
            .update({ auto_replied: true })
            .eq("comment_id", commentId);
        }
      }

      // 2) Fallback: generic Copilot live auto-reply with safety filters
      if (liveRuleFired) continue;
      if (!account.auto_reply_lives || !text) continue;
      if (text.trim().length < 3) continue;
      if (/https?:\/\//i.test(text)) continue;

      // Anti-spam: skip if same user replied in last 60s
      const { data: recent } = await supabase
        .from("instagram_live_comments")
        .select("id")
        .eq("ig_account_id", account.id)
        .eq("from_ig_user_id", fromIgId)
        .eq("auto_replied", true)
        .gte("created_at", new Date(Date.now() - 60_000).toISOString())
        .limit(1);
      if (recent && recent.length > 0) continue;

      await triggerCopilotReply({
        tenantId: account.tenant_id,
        ig_account_id: account.id,
        ig_user_id: fromIgId || "unknown",
        username: fromUsername,
        text,
        channel: "live",
        comment_id: commentId,
        context: { live_id: liveId },
      });

      await supabase
        .from("instagram_live_comments")
        .update({ auto_replied: true })
        .eq("comment_id", commentId);
    }

    // mentions → treat like inbound DM trigger (skipped for now, future)
  }
}

// ── server ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("[ig-webhook] payload:", JSON.stringify(payload).slice(0, 500));

    if (payload.object !== "instagram" && payload.object !== "page") {
      return new Response("ignored", { status: 200 });
    }

    for (const entry of payload.entry || []) {
      if (entry.messaging) {
        await handleMessaging(entry);
      }
      if (entry.changes) {
        await handleChanges(entry);
      }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (e) {
    console.error("[ig-webhook] error:", e);
    return new Response("error", { status: 200 }); // always 200 to Meta
  }
});
