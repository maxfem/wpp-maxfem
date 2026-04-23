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

async function resolveCustomerByIgUser(tenantId: string, igUserId: string, username?: string) {
  // try lookup by custom_attributes->instagram->ig_user_id
  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, custom_attributes")
    .eq("tenant_id", tenantId)
    .filter("custom_attributes->instagram->>ig_user_id", "eq", igUserId)
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

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

      const customer = await resolveCustomerByIgUser(account.tenant_id, igUserId);

      let content: string | null = msg.text || null;
      let messageType = "text";
      let mediaUrl: string | null = null;

      if (msg.attachments?.length) {
        const att = msg.attachments[0];
        messageType = att.type || "attachment";
        mediaUrl = att.payload?.url || null;
        if (!content) content = `[${messageType}]`;
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
          metadata: msg,
        })
        .select()
        .single();

      console.log("[ig-webhook] message saved:", inserted?.id);

      // Auto-reply DMs if enabled and inbound and within 24h (always within for fresh inbound)
      if (isInbound && account.auto_reply_dms && content) {
        await triggerCopilotReply({
          tenantId: account.tenant_id,
          ig_account_id: account.id,
          ig_user_id: igUserId,
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

      if (account.auto_reply_comments && text) {
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

      // Auto reply with safety filters
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
