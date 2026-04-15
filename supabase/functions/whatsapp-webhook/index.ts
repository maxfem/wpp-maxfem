import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== HELPERS =====

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function findCustomerByPhone(phone: string, tenantId?: string) {
  const clean = normalizePhone(phone);
  const variations = new Set<string>();
  variations.add(clean);
  variations.add(`+${clean}`);
  if (clean.startsWith("55") && clean.length >= 12) {
    variations.add(clean.slice(2));
    variations.add(`+${clean.slice(2)}`);
  } else {
    variations.add(`55${clean}`);
    variations.add(`+55${clean}`);
  }

  const orFilter = Array.from(variations).map(v => `phone.eq.${v}`).join(",");
  let query = supabase.from("customers").select("id, tenant_id, name, phone, custom_attributes").or(orFilter).limit(1);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) console.error("findCustomerByPhone error:", error);
  return data?.[0] || null;
}

async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn(`[webhook] No whatsapp_account for phone_number_id=${phoneNumberId}, fallback`);
    const { data: tenants } = await supabase.from("tenants").select("id").limit(1);
    return tenants?.[0]?.id || null;
  }
  return data.tenant_id;
}

async function resolveAccessToken(tenantId: string): Promise<string> {
  const { data: waAccount } = await supabase
    .from("whatsapp_accounts")
    .select("access_token")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .single();
  return waAccount?.access_token || WHATSAPP_ACCESS_TOKEN;
}

// ===== MEDIA HANDLING =====

async function downloadAndStoreMedia(mediaId: string, mimeType: string, tenantId: string): Promise<string | null> {
  try {
    const token = await resolveAccessToken(tenantId);
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) { console.error(`[webhook] Failed to get media URL for ${mediaId}: ${metaRes.status}`); return null; }
    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    if (!downloadUrl) return null;

    const mediaRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!mediaRes.ok) { console.error(`[webhook] Failed to download media: ${mediaRes.status}`); return null; }
    const mediaBlob = await mediaRes.blob();

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "video/mp4": "mp4", "video/3gpp": "3gp",
      "audio/aac": "aac", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/amr": "amr", "audio/ogg": "ogg",
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    };
    const ext = extMap[mimeType] || "bin";
    const filePath = `${tenantId}/${mediaId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(filePath, mediaBlob, { contentType: mimeType, upsert: true });

    if (uploadError) { console.error(`[webhook] Storage upload error:`, uploadError); return null; }

    // Store the path (not public URL) — client will use signed URLs
    console.log(`[webhook] Media stored: ${filePath}`);
    return filePath;
  } catch (err) {
    console.error(`[webhook] downloadAndStoreMedia error:`, err);
    return null;
  }
}

// ===== ACTIVITY TRACKING =====

async function propagateStatusToActivity(wamid: string, status: string) {
  const { data: msg } = await supabase
    .from("whatsapp_messages")
    .select("customer_id, tenant_id")
    .eq("wamid", wamid)
    .limit(1)
    .single();

  if (!msg?.customer_id) return;

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  if (status === "delivered") {
    await supabase.from("campaign_activities").update({ delivered_at: now })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .is("delivered_at", null).gte("sent_at", cutoff);
  } else if (status === "read") {
    await supabase.from("campaign_activities").update({ read_at: now })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .is("read_at", null).gte("sent_at", cutoff);
  } else if (status === "failed") {
    await supabase.from("campaign_activities").update({ status: "failed" })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .eq("status", "pending").gte("sent_at", cutoff);
  }
}

async function markRepliedActivity(customerId: string, tenantId: string) {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await supabase.from("campaign_activities").update({ replied_at: now })
    .eq("customer_id", customerId).eq("tenant_id", tenantId)
    .is("replied_at", null).gte("sent_at", cutoff);
}

// ===== ORDER LOOKUPS =====

async function lookupOrdersByCpf(tenantId: string, cpf: string): Promise<string> {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) return JSON.stringify({ error: "CPF inválido. Informe os 11 dígitos." });

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, document, phone")
    .eq("tenant_id", tenantId)
    .eq("document", cleanCpf)
    .maybeSingle();

  if (!customer) return JSON.stringify({ error: "Nenhum cliente encontrado com esse CPF.", cpf: cleanCpf });

  const { data: orders } = await supabase
    .from("orders")
    .select("id, external_id, order_number, total, status, mapped_status, status_alias, tracking_code, tracking_url, carrier, delivery_estimate, payment_summary, items_summary, created_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!orders || orders.length === 0) {
    return JSON.stringify({ customer_name: customer.name, cpf: cleanCpf, orders: [], message: "Cliente encontrado, mas sem pedidos registrados." });
  }

  const statusLabels: Record<string, string> = {
    pending: "Aguardando pagamento", waiting_payment: "Aguardando pagamento",
    paid: "Pago", invoiced: "Faturado", shipped: "Enviado",
    on_carriage: "Em transporte", in_transit: "Em transporte",
    delivered: "Entregue", cancelled: "Cancelado", refunded: "Reembolsado",
  };

  const formattedOrders = orders.map((o: any) => ({
    order_number: o.order_number || o.external_id?.replace("yampi_", "") || o.id,
    status: statusLabels[o.status_alias || o.status] || o.status,
    status_alias: o.status_alias || o.status,
    total: o.total, created_at: o.created_at,
    tracking_code: o.tracking_code || null, tracking_url: o.tracking_url || null,
    carrier: o.carrier || null, payments: o.payment_summary || [], items: o.items_summary || [],
  }));

  return JSON.stringify({ customer_name: customer.name, cpf: cleanCpf, orders_count: formattedOrders.length, orders: formattedOrders,
    note: "Dados sincronizados da plataforma. Se o rastreio não aparece, pode estar pendente de atualização na origem." });
}

// ===== BLING INTEGRATION =====

async function refreshBlingToken(integrationId: string, cfg: any): Promise<string | null> {
  const clientId = Deno.env.get("BLING_CLIENT_ID");
  const clientSecret = Deno.env.get("BLING_CLIENT_SECRET");
  if (!clientId || !clientSecret || !cfg?.refresh_token) return null;

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) { console.error("[webhook] Bling refresh failed:", data); return null; }

    const now = new Date();
    const newConfig = {
      ...cfg, access_token: data.access_token, refresh_token: data.refresh_token,
      access_expires_at: new Date(now.getTime() + (data.expires_in || 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await supabase.from("integrations").update({ config: newConfig, sync_error: null, updated_at: now.toISOString() }).eq("id", integrationId);
    return data.access_token;
  } catch (e) { console.error("[webhook] Bling refresh error:", e); return null; }
}

async function lookupOrdersBling(tenantId: string, cpf: string): Promise<string> {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) return JSON.stringify({ error: "CPF inválido. Informe os 11 dígitos." });

  try {
    const { data: blingIntegration } = await supabase
      .from("integrations").select("id, config")
      .eq("tenant_id", tenantId).eq("provider", "bling").eq("is_active", true).maybeSingle();

    if (!blingIntegration) return JSON.stringify({ error: "Integração Bling não configurada." });

    const cfg = blingIntegration.config as any;
    let accessToken = cfg?.access_token;
    if (!accessToken) return JSON.stringify({ error: "Token do Bling expirado ou inválido." });

    const expiresAt = cfg.access_expires_at ? new Date(cfg.access_expires_at).getTime() : 0;
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      const newToken = await refreshBlingToken(blingIntegration.id, cfg);
      if (newToken) accessToken = newToken;
    }

    const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    let contactRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (contactRes.status === 401) {
      const newToken = await refreshBlingToken(blingIntegration.id, cfg);
      if (newToken) {
        accessToken = newToken;
        contactRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
      }
    }

    if (!contactRes.ok) return JSON.stringify({ error: "Erro ao consultar Bling." });

    const contactData = await contactRes.json();
    const contacts = contactData?.data || [];
    if (contacts.length === 0) return JSON.stringify({ error: "Nenhum cliente encontrado no Bling com esse CPF.", cpf: formattedCpf });

    const contactId = contacts[0].id;
    const contactName = contacts[0].nome;

    const ordersRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas?idContato=${contactId}&limit=5`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!ordersRes.ok) return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Erro ao buscar pedidos no Bling." });

    const ordersData = await ordersRes.json();
    const ordersList = ordersData?.data || [];
    if (ordersList.length === 0) return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Cliente encontrado no Bling, mas sem pedidos." });

    const detailedOrders = [];
    for (const order of ordersList.slice(0, 5)) {
      const detailRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${order.id}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();
      const d = detail?.data;
      if (!d) continue;

      const volumes = d.transporte?.volumes || [];
      let trackingCode = volumes[0]?.codigoRastreamento || null;
      let carrier = d.transporte?.contato?.nome || null;
      let trackingUrl: string | null = null;

      if (!trackingCode && d.notaFiscal?.id) {
        try {
          const nfeRes = await fetch(`https://www.bling.com.br/Api/v3/nfe/${d.notaFiscal.id}`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          });
          if (nfeRes.ok) {
            const nfe = (await nfeRes.json())?.data;
            trackingCode = nfe?.transporte?.volumes?.[0]?.codigoRastreamento || trackingCode;
            if (!carrier) carrier = nfe?.transporte?.transportador?.nome || null;
          }
        } catch (_) { /* ignore */ }
      }

      if (!trackingCode) {
        try {
          const logRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${order.id}/logistica`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          });
          if (logRes.ok) {
            const logItems = (await logRes.json())?.data || [];
            if (logItems.length > 0) {
              trackingCode = logItems[0]?.codigoRastreamento || logItems[0]?.rastreamento?.codigo || trackingCode;
              trackingUrl = logItems[0]?.linkRastreamento || logItems[0]?.rastreamento?.link || null;
            }
          }
        } catch (_) { /* ignore */ }
      }

      if (trackingCode && !trackingUrl) {
        if (/^BLI[_-]/i.test(trackingCode)) trackingUrl = `https://www.loggi.com/rastreador/${trackingCode}`;
        else if (/^\d{5,}[A-Z]{2}\d?[A-Z0-9]+$/i.test(trackingCode)) trackingUrl = `https://rastreio.fmtransportes.com.br/#/${trackingCode}`;
        else trackingUrl = `https://rastreamento.correios.com.br/app/index.php?objetos=${trackingCode}`;
      }

      detailedOrders.push({
        order_number: d.numero, total: d.total, date: d.data,
        tracking_code: trackingCode, tracking_url: trackingUrl, carrier,
        payments: (d.parcelas || []).map((p: any) => ({ value: p.valor, due_date: p.dataVencimento, method: p.observacoes || "" })),
        items: (d.itens || []).map((i: any) => ({ name: i.descricao, quantity: i.quantidade, value: i.valor })),
      });
    }

    return JSON.stringify({ source: "bling", customer_name: contactName, cpf: formattedCpf, orders_count: detailedOrders.length, orders: detailedOrders });
  } catch (err) {
    console.error("[webhook] Bling lookup error:", err);
    return JSON.stringify({ error: "Erro interno ao consultar o Bling." });
  }
}

// ===== AI COPILOT =====

const aiTools = [
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_by_cpf",
      description: "Consulta pedidos de um cliente pelo CPF nos dados sincronizados do sistema local.",
      parameters: { type: "object", properties: { cpf: { type: "string", description: "CPF do cliente" } }, required: ["cpf"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_bling",
      description: "Consulta pedidos e código de rastreio em tempo real na API do Bling pelo CPF do cliente. Priorize esta função para dados mais atualizados.",
      parameters: { type: "object", properties: { cpf: { type: "string", description: "CPF do cliente" } }, required: ["cpf"] },
    },
  },
];

async function tryAutoRespondWithAI(tenantId: string, customerId: string, phone: string, customerAttrs: Record<string, any> | null) {
  try {
    const attrs = customerAttrs || {};
    if (attrs.ai_enabled === false) return;

    const { data: integration } = await supabase
      .from("integrations").select("config")
      .eq("tenant_id", tenantId).eq("provider", "openai").eq("is_active", true).maybeSingle();

    if (!integration) return;

    const config = integration.config as any;
    const apiKey = config?.openai_api_key;
    if (!apiKey) return;

    const { data: recentMsgs } = await supabase
      .from("whatsapp_messages")
      .select("direction, content, message_type, created_at")
      .eq("tenant_id", tenantId).eq("phone", phone)
      .order("created_at", { ascending: false }).limit(20);

    if (!recentMsgs || recentMsgs.length === 0) return;

    const tone = attrs.ai_tone && attrs.ai_tone !== "default" ? attrs.ai_tone : (config.tone || "friendly");
    const model = config.model || "gpt-4o-mini";
    const systemPrompt = config.system_prompt || "Você é um assistente de atendimento ao cliente.";
    const extraContext = attrs.ai_context || "";

    const toneInstructions: Record<string, string> = {
      formal: "Use linguagem formal e profissional.",
      friendly: "Use um tom caloroso e acolhedor.",
      informal: "Use linguagem descontraída e casual.",
      technical: "Seja preciso, objetivo e técnico.",
    };

    const { data: orderIntegrations } = await supabase
      .from("integrations").select("provider")
      .eq("tenant_id", tenantId).in("provider", ["yampi", "bling"]).eq("is_active", true);

    const hasYampi = orderIntegrations?.some((i: any) => i.provider === "yampi");
    const hasBling = orderIntegrations?.some((i: any) => i.provider === "bling");
    const hasOrderTools = hasYampi || hasBling;

    const activeTools: any[] = [];
    if (hasYampi) activeTools.push(aiTools[0]);
    if (hasBling) activeTools.push(aiTools[1]);

    let orderInstructions = "";
    if (hasOrderTools) {
      orderInstructions = `\nVocê tem acesso a funções para consultar pedidos do cliente pelo CPF.
${hasBling ? "SEMPRE use lookup_orders_bling PRIMEIRO para consultar rastreio — ele busca dados em tempo real direto do ERP Bling." : ""}
${hasYampi && !hasBling ? "Use lookup_orders_by_cpf para dados sincronizados localmente." : ""}

REGRAS IMPORTANTES para resposta sobre pedidos:
- Se o campo tracking_code existir, SEMPRE informe o código de rastreio e o link de rastreio (tracking_url) ao cliente.
- Formate: número do pedido, status, rastreio (se houver), link de rastreio, transportadora, valor.
- SOMENTE diga "código de rastreio ainda não disponível" quando tracking_code for null ou vazio.
- Nunca invente informações.`;
    }

    const fullSystemPrompt = `${systemPrompt}\n\nTom de voz: ${toneInstructions[tone] || toneInstructions.friendly}${extraContext ? `\nContexto adicional desta conversa: ${extraContext}` : ""}${orderInstructions}\n\nVocê está respondendo automaticamente ao cliente via WhatsApp. Responda de forma natural e direta, como se fosse um atendente humano. Não use formatações como markdown. Seja breve e objetivo.`;

    const chatMessages: any[] = [
      { role: "system", content: fullSystemPrompt },
      ...recentMsgs.reverse().map((m: any) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.content || `[${m.message_type}]` })),
    ];

    const openaiBody: any = { model, messages: chatMessages, max_tokens: 500, temperature: 0.7 };
    if (hasOrderTools) { openaiBody.tools = activeTools; openaiBody.tool_choice = "auto"; }

    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiResponse.ok) { console.error(`[webhook] OpenAI error: ${openaiResponse.status}`); return; }

    let result = await openaiResponse.json();
    let assistantMessage = result.choices?.[0]?.message;

    let iterations = 0;
    while (assistantMessage?.tool_calls?.length > 0 && iterations < 5) {
      iterations++;
      chatMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult = "";
        if (toolCall.function.name === "lookup_orders_by_cpf") toolResult = await lookupOrdersByCpf(tenantId, args.cpf);
        else if (toolCall.function.name === "lookup_orders_bling") toolResult = await lookupOrdersBling(tenantId, args.cpf);
        chatMessages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult });
      }

      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: chatMessages, max_tokens: 800, temperature: 0.7 }),
      });

      if (!openaiResponse.ok) break;
      result = await openaiResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    const aiReply = assistantMessage?.content?.trim();
    if (!aiReply) return;

    const token = await resolveAccessToken(tenantId);
    let phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts").select("phone_number_id")
      .eq("tenant_id", tenantId).eq("is_active", true).limit(1).single();
    if (waAccount?.phone_number_id) phoneNumberId = waAccount.phone_number_id;

    const waResponse = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: aiReply } }),
    });

    const waResult = await waResponse.json();
    if (!waResponse.ok) { console.error(`[webhook] Failed to send AI reply:`, waResult); return; }

    await supabase.from("whatsapp_messages").insert({
      tenant_id: tenantId, customer_id: customerId, phone, direction: "outbound",
      message_type: "text", content: aiReply, wamid: waResult.messages?.[0]?.id, status: "sent",
      metadata: { ai_generated: true },
    });

    console.log(`[webhook] AI auto-reply sent to ${phone}`);
  } catch (err) {
    console.error(`[webhook] AI auto-respond error:`, err);
  }
}

// ===== RATE LIMITING =====
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute per IP
const RATE_WINDOW = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ===== MAIN HANDLER =====

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response("Too Many Requests", { status: 429 });
    }

    try {
      const body = await req.json();
      console.log("[webhook] POST received");

      const entries = body?.entry;
      if (!entries || !Array.isArray(entries)) return new Response("OK", { status: 200 });

      for (const entry of entries) {
        const changes = entry?.changes;
        if (!changes || !Array.isArray(changes)) continue;

        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          const tenantId = await resolveTenantByPhoneNumberId(phoneNumberId || "");
          if (!tenantId) { console.error("[webhook] Could not resolve tenant for:", phoneNumberId); continue; }

          // Process status updates
          if (value.statuses && Array.isArray(value.statuses)) {
            for (const status of value.statuses) {
              const { id: wamid, status: msgStatus } = status;
              await supabase.from("whatsapp_messages").update({ status: msgStatus }).eq("wamid", wamid);
              await propagateStatusToActivity(wamid, msgStatus);
            }
          }

          // Process inbound messages
          if (value.messages && Array.isArray(value.messages)) {
            const contact = value.contacts?.[0];

            for (const message of value.messages) {
              const phone = message.from;
              const wamid = message.id;
              const msgType = message.type || "text";

              let content = "";
              let mediaUrl: string | null = null;

              switch (msgType) {
                case "text": content = message.text?.body || ""; break;
                case "image": case "video": case "audio": case "document": {
                  const mediaData = message[msgType];
                  content = mediaData?.caption || "";
                  const mediaId = mediaData?.id;
                  const mimeType = mediaData?.mime_type || "application/octet-stream";
                  if (mediaId) mediaUrl = await downloadAndStoreMedia(mediaId, mimeType, tenantId);
                  if (msgType === "document" && mediaData?.filename) content = content || mediaData.filename;
                  break;
                }
                case "sticker": {
                  const stickerId = message.sticker?.id;
                  if (stickerId) mediaUrl = await downloadAndStoreMedia(stickerId, message.sticker?.mime_type || "image/webp", tenantId);
                  content = "[Sticker]"; break;
                }
                case "reaction": content = message.reaction?.emoji || ""; break;
                case "location": content = `📍 ${message.location?.latitude},${message.location?.longitude}`; break;
                default: content = `[${msgType}]`;
              }

              let customer = await findCustomerByPhone(phone, tenantId);
              if (!customer) {
                const customerName = contact?.profile?.name || phone;
                const { data: newCustomer, error: createError } = await supabase
                  .from("customers")
                  .insert({ name: customerName, phone, tenant_id: tenantId, is_lead: true })
                  .select("id, tenant_id, name, phone, custom_attributes").single();
                if (createError) { console.error("[webhook] Create customer error:", createError); continue; }
                customer = newCustomer;
              }

              await supabase.from("whatsapp_messages").insert({
                tenant_id: tenantId, customer_id: customer!.id, phone, direction: "inbound",
                message_type: msgType === "sticker" ? "image" : msgType, content, media_url: mediaUrl,
                wamid, status: "received",
                metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name },
              });

              await markRepliedActivity(customer!.id, tenantId);
              console.log(`[webhook] Saved ${msgType} from ${phone}${mediaUrl ? " (with media)" : ""}`);

              tryAutoRespondWithAI(tenantId, customer!.id, phone, customer!.custom_attributes || null);
            }
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[webhook] Error:", error);
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
