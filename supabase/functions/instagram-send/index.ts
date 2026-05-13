import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── UTM helpers ────────────────────────────────────────────────────
const STORE_DOMAIN = "https://maxfem.com.br";
const DEFAULT_PRODUCT_URL = `${STORE_DOMAIN}/`;

function buildUtmUrl(rawUrl: string, opts: { source?: string; medium?: string; campaign?: string; content?: string }) {
  try {
    const url = new URL(rawUrl);
    const params = url.searchParams;
    if (!params.has("utm_source")) params.set("utm_source", opts.source || "copilot");
    if (!params.has("utm_medium")) params.set("utm_medium", opts.medium || "instagram");
    if (!params.has("utm_campaign")) params.set("utm_campaign", opts.campaign || "comment_to_dm");
    if (!params.has("utm_content")) params.set("utm_content", opts.content || "auto_reply");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

// Heuristic: does the comment text express purchase intent?
function isPurchaseIntent(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /\bcomprar?\b/, /\bcompro\b/, /\bquero\b/, /\bvalor(es)?\b/, /\bpre(ç|c)o\b/,
    /\bquanto\s+(custa|é|sai)/, /\bonde\s+(comprar|encontro|acho)/, /\blink\b/,
    /\bsite\b/, /\bdispon(í|i)vel\b/, /\bestoque\b/, /\btem\s+(pra|para)\s+vender/,
    /como\s+(fa(ç|c)o|adquir|consig|pe(ç|c)o)/, /interessad[ao]/, /quero\s+um/,
  ];
  return patterns.some((p) => p.test(t));
}

// Try to find a relevant product URL based on incoming text using existing tracked_links / message_templates
async function pickProductUrl(tenantId: string, incoming: string): Promise<string> {
  const lower = incoming.toLowerCase();
  // 1) Look at recent tracked_links for this tenant — pick the most-clicked matching keyword
  const { data: links } = await supabase
    .from("tracked_links")
    .select("original_url")
    .eq("tenant_id", tenantId)
    .ilike("original_url", `%${STORE_DOMAIN.replace("https://", "")}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (links?.length) {
    // try to match a product slug present in the comment (e.g., "imunofem", "candidíase")
    for (const l of links) {
      try {
        const slug = new URL(l.original_url).pathname.toLowerCase();
        const tokens = slug.split(/[/\-_]+/).filter((t) => t.length > 3);
        if (tokens.some((tk) => lower.includes(tk))) return l.original_url;
      } catch { /* ignore */ }
    }
    return links[0].original_url;
  }
  return DEFAULT_PRODUCT_URL;
}

// ── Copilot: generate reply via Lovable AI (Gemini) ────────────────
async function generateCopilotReply(opts: {
  tenantId: string;
  channel: "dm" | "comment" | "live";
  incoming: string;
  username?: string;
  context?: any;
  forcePurchaseRedirect?: boolean;
}): Promise<string | null> {
  // load tone/prompt from integrations table — Gemini tem prioridade, OpenAI é fallback legado
  let { data: integ } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", opts.tenantId)
    .eq("provider", "gemini")
    .eq("is_active", true)
    .maybeSingle();
  if (!integ) {
    const { data: oai } = await supabase
      .from("integrations")
      .select("config")
      .eq("tenant_id", opts.tenantId)
      .eq("provider", "openai")
      .eq("is_active", true)
      .maybeSingle();
    integ = oai;
  }

  const tone = integ?.config?.tone || "amigável e prestativo";
  const customPrompt = integ?.config?.instagram_prompt || integ?.config?.system_prompt || "";
  const apiKey = integ?.config?.api_key || FALLBACK_GEMINI_API_KEY;
  const model = (integ?.config?.model || "gemini-2.5-flash").replace(/^google\//, "");

  if (!apiKey) {
    console.error("[ig-send] gemini api key não configurada");
    return null;
  }

  let channelHint =
    opts.channel === "live"
      ? "Você está respondendo um comentário em uma transmissão ao vivo do Instagram. Seja muito breve (máximo 1 frase, até 120 caracteres), use emojis e tom super informal."
      : opts.channel === "comment"
      ? "Você está respondendo um comentário público em um post do Instagram. Seja amigável, breve (máximo 2 frases), use 1-2 emojis."
      : "Você está respondendo uma DM do Instagram. Tom informal com emojis, máximo 4 frases.";

  if (opts.forcePurchaseRedirect && opts.channel === "comment") {
    channelHint = "Você está respondendo PUBLICAMENTE um comentário no Instagram em que a pessoa demonstrou interesse de compra. NÃO inclua link no comentário público. Apenas avise de forma breve e calorosa que você acabou de mandar o link no Direct (DM). Máximo 1-2 frases, use 1-2 emojis. Exemplo: 'Oba! Te mandei o link no Direct agora 💖✨'";
  }

  const systemPrompt = `Você é um assistente de atendimento da loja. Tom: ${tone}.\n${channelHint}\n${customPrompt}\nNunca invente informações sobre pedidos.`;

  const userMsg = opts.username ? `@${opts.username}: ${opts.incoming}` : opts.incoming;

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!res.ok) {
    console.error("[ig-send] copilot fail:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// ── Full Copilot for DMs (uses ai-copilot with Bling/CPF tools) ────
async function generateFullCopilotDmReply(opts: {
  tenantId: string;
  igAccountId: string;
  igUserId: string;
  username?: string;
  incoming: string;
}): Promise<string | null> {
  try {
    // Load last ~15 messages of this conversation for context
    const { data: history } = await supabase
      .from("instagram_messages")
      .select("direction, message_type, content, media_url, created_at")
      .eq("tenant_id", opts.tenantId)
      .eq("ig_account_id", opts.igAccountId)
      .eq("ig_user_id", opts.igUserId)
      .order("created_at", { ascending: true })
      .limit(15);

    const messages = (history || []).map((m: any) => ({
      direction: m.direction,
      message_type: m.message_type,
      content: m.content,
      media_url: m.media_url,
    }));

    // Make sure the most recent inbound text is included (in case it wasn't persisted yet)
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound || (lastInbound.content || "") !== opts.incoming) {
      messages.push({
        direction: "inbound",
        message_type: "text",
        content: opts.incoming,
        media_url: null,
      });
    }

    const conversationContext = `Esta é uma DM do Instagram${opts.username ? ` de @${opts.username}` : ""}. Mantenha respostas curtas (máximo 4 frases), com 1-2 emojis. Se o cliente enviar um CPF (11 dígitos com ou sem pontuação), use a ferramenta de consulta de pedidos para buscar status, código de rastreio e link.`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-copilot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-internal-call": Deno.env.get("CRON_SECRET") || "",
      },
      body: JSON.stringify({
        tenant_id: opts.tenantId,
        messages,
        conversation_context: conversationContext,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ig-send] full-copilot DM failed:", res.status, errText);
      return null;
    }

    const data = await res.json();
    return (data.suggestion || data.reply || data.message || data.content || "").trim() || null;
  } catch (e) {
    console.error("[ig-send] full-copilot DM error:", e);
    return null;
  }
}

// ── Meta API helpers ───────────────────────────────────────────────
// Detect token type:
//  - "IGAA..." → Instagram Login token → graph.instagram.com (no version prefix on /me/messages)
//  - "EAA..."  → Facebook Page/User token → graph.facebook.com/v22.0
function graphBase(token: string): string {
  return token?.startsWith("IGAA")
    ? "https://graph.instagram.com/v22.0"
    : "https://graph.facebook.com/v22.0";
}

async function sendDM(account: any, recipientId: string, text: string) {
  const base = graphBase(account.access_token);
  const url = `${base}/${account.ig_user_id}/messages?access_token=${account.access_token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta DM error: ${JSON.stringify(data)}`);
  return data;
}

async function replyToComment(account: any, commentId: string, text: string) {
  const base = graphBase(account.access_token);
  const url = `${base}/${commentId}/replies?access_token=${account.access_token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta comment reply error: ${JSON.stringify(data)}`);
  return data;
}

async function sendPrivateReply(account: any, commentId: string, text: string) {
  const base = graphBase(account.access_token);
  const url = `${base}/${account.ig_user_id}/messages?access_token=${account.access_token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta private reply error: ${JSON.stringify(data)}`);
  return data;
}

// ── HTTP handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      mode = "manual", // "manual" | "auto_reply" | "rule_reply"
      tenant_id,
      ig_account_id,
      ig_user_id, // recipient for DM
      message,    // for manual DM
      channel = "dm", // "dm" | "comment" | "live" | "private_reply"
      comment_id,
      incoming_text, // for auto_reply
      username,
      context,
      // rule_reply fields
      rule_id,
      post_id,
      from_ig_user_id,
      from_username,
      matched_by,
      matched_term,
    } = body;

    if (!tenant_id || !ig_account_id) {
      return new Response(JSON.stringify({ error: "tenant_id and ig_account_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("id", ig_account_id)
      .single();

    if (!account || !account.access_token) {
      return new Response(JSON.stringify({ error: "Account not found or no token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── rule_reply: ManyChat-style rule ─────────────────────────────
    if (mode === "rule_reply") {
      if (!rule_id || !comment_id) throw new Error("rule_id and comment_id required");
      const { data: rule } = await supabase
        .from("instagram_comment_rules")
        .select("*")
        .eq("id", rule_id)
        .single();
      if (!rule) throw new Error("rule not found");

      // build short tracked link with UTMs
      let trackedLinkId: string | null = null;
      let shortUrl: string | null = null;
      if (rule.dm_link_url) {
        const code = Math.random().toString(36).slice(2, 10);
        const slug = (rule.name || "rule").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
        const { data: link } = await supabase
          .from("tracked_links")
          .insert({
            tenant_id,
            code,
            original_url: rule.dm_link_url,
            utm_source: "instagram",
            utm_medium: "comment_to_dm",
            utm_campaign: slug,
            utm_content: post_id ? `post_${post_id}` : `rule_${rule_id}`,
          })
          .select("id")
          .single();
        trackedLinkId = link?.id || null;
        shortUrl = `https://wpp.maxapps.com.br/r/${code}`;
      }

      const renderTemplate = (tpl: string) =>
        (tpl || "")
          .replaceAll("{{username}}", from_username || username || "")
          .replaceAll("{{link}}", shortUrl || rule.dm_link_url || "");

      const publicText = renderTemplate(rule.public_reply_text);
      const dmText = renderTemplate(rule.dm_text);

      let publicStatus = "skipped";
      let dmStatus = "skipped";
      let dmMessageId: string | null = null;
      let runError: string | null = null;

      // 1) Public reply on the comment (skip on lives only if you want; we reply on both)
      try {
        if (publicText) {
          const r = await replyToComment(account, comment_id, publicText);
          publicStatus = "sent";
          await supabase
            .from("instagram_comments")
            .update({ replied: true, reply_id: r.id, reply_content: publicText })
            .eq("comment_id", comment_id);
        }
      } catch (e) {
        publicStatus = "error";
        runError = `public:${e instanceof Error ? e.message : "err"}`;
        console.error("[ig-send] rule public reply failed:", e);
      }

      // 2) Private reply (DM)
      try {
        if (dmText) {
          const dm = await sendPrivateReply(account, comment_id, dmText);
          dmStatus = "sent";
          dmMessageId = dm?.message_id || null;
          await supabase.from("instagram_messages").insert({
            tenant_id,
            ig_account_id,
            ig_user_id: from_ig_user_id || "unknown",
            username: from_username || username,
            direction: "outbound",
            message_type: "text",
            content: dmText,
            status: "sent",
            message_id: dmMessageId,
            metadata: { auto: true, source: "rule_reply", rule_id, comment_id },
          });
        }
      } catch (e) {
        dmStatus = "error";
        runError = (runError ? runError + "; " : "") + `dm:${e instanceof Error ? e.message : "err"}`;
        console.error("[ig-send] rule DM failed:", e);
      }

      // 3) Log execution + bump stats
      await supabase.from("instagram_rule_executions").insert({
        tenant_id,
        rule_id,
        ig_account_id,
        comment_id,
        post_id: post_id || null,
        from_ig_user_id: from_ig_user_id || null,
        from_username: from_username || null,
        matched_by: matched_by || "keyword",
        matched_term: matched_term || null,
        public_reply_status: publicStatus,
        dm_status: dmStatus,
        dm_message_id: dmMessageId,
        tracked_link_id: trackedLinkId,
        error: runError,
      });

      await supabase
        .from("instagram_comment_rules")
        .update({
          stats_sent: (rule.stats_sent || 0) + (publicStatus === "sent" ? 1 : 0),
          stats_dm_sent: (rule.stats_dm_sent || 0) + (dmStatus === "sent" ? 1 : 0),
        })
        .eq("id", rule_id);

      return new Response(
        JSON.stringify({ success: true, public_status: publicStatus, dm_status: dmStatus, short_url: shortUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let textToSend: string | null = message || null;

    // Detect purchase intent on incoming comments to trigger combined comment + DM flow
    const purchaseIntent =
      mode === "auto_reply" &&
      (channel === "comment" || channel === "live") &&
      isPurchaseIntent(incoming_text || "");

    // auto-reply: ask Copilot for the text
    if (mode === "auto_reply") {
      // DMs use the full ai-copilot (with Bling/CPF order lookup tools).
      // Comments/lives stay on the lightweight Gemini reply (no data exposure in public).
      if (channel === "dm") {
        textToSend = await generateFullCopilotDmReply({
          tenantId: tenant_id,
          igAccountId: ig_account_id,
          igUserId: ig_user_id,
          username,
          incoming: incoming_text || "",
        });
      } else {
        textToSend = await generateCopilotReply({
          tenantId: tenant_id,
          channel: channel === "private_reply" ? "comment" : (channel as any),
          incoming: incoming_text || "",
          username,
          context,
          forcePurchaseRedirect: purchaseIntent,
        });
      }
      if (!textToSend) {
        return new Response(JSON.stringify({ error: "Copilot returned no text" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!textToSend) {
      return new Response(JSON.stringify({ error: "no message to send" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // route by channel
    let result: any;
    let dmResult: any = null;
    let dmText: string | null = null;
    if (channel === "dm") {
      if (!ig_user_id) throw new Error("ig_user_id required for DM");
      result = await sendDM(account, ig_user_id, textToSend);

      await supabase.from("instagram_messages").insert({
        tenant_id,
        ig_account_id,
        ig_user_id,
        username,
        direction: "outbound",
        message_type: "text",
        content: textToSend,
        status: "sent",
        message_id: result.message_id,
        metadata: { auto: mode === "auto_reply" },
      });
    } else if (channel === "comment") {
      if (!comment_id) throw new Error("comment_id required");
      result = await replyToComment(account, comment_id, textToSend);

      await supabase
        .from("instagram_comments")
        .update({
          replied: true,
          reply_id: result.id,
          reply_content: textToSend,
        })
        .eq("comment_id", comment_id);

      // Purchase intent: also send Private Reply (DM) with product link + UTMs
      if (purchaseIntent) {
        try {
          const productUrl = await pickProductUrl(tenant_id, incoming_text || "");
          const linkWithUtm = buildUtmUrl(productUrl, {
            source: "copilot",
            medium: "instagram",
            campaign: "comment_to_dm",
            content: context?.post_id ? `post_${context.post_id}` : "auto_reply",
          });
          dmText = `Oi${username ? ` @${username}` : ""}! 💖 Aqui está o link do produto pra você: ${linkWithUtm}\n\nQualquer dúvida é só me chamar por aqui! ✨`;
          dmResult = await sendPrivateReply(account, comment_id, dmText);

          // Log the DM in instagram_messages so it appears in chat history
          await supabase.from("instagram_messages").insert({
            tenant_id,
            ig_account_id,
            ig_user_id: ig_user_id || "unknown",
            username,
            direction: "outbound",
            message_type: "text",
            content: dmText,
            status: "sent",
            message_id: dmResult?.message_id,
            metadata: { auto: true, source: "comment_purchase_intent", comment_id },
          });
        } catch (e) {
          console.error("[ig-send] purchase-intent DM failed:", e);
        }
      }
    } else if (channel === "private_reply") {
      if (!comment_id) throw new Error("comment_id required");
      result = await sendPrivateReply(account, comment_id, textToSend);

      await supabase
        .from("instagram_comments")
        .update({
          replied: true,
          reply_id: result.message_id,
          reply_content: `[DM] ${textToSend}`,
        })
        .eq("comment_id", comment_id);
    } else if (channel === "live") {
      if (!comment_id) throw new Error("comment_id required");
      // Live comments are replied via the same /replies endpoint
      result = await replyToComment(account, comment_id, textToSend);

      await supabase
        .from("instagram_live_comments")
        .update({
          auto_replied: true,
          reply_content: textToSend,
          reply_status: "sent",
        })
        .eq("comment_id", comment_id);
    } else {
      throw new Error(`Unknown channel: ${channel}`);
    }

    return new Response(
      JSON.stringify({ success: true, result, sent_text: textToSend, dm_result: dmResult, dm_text: dmText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ig-send] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
