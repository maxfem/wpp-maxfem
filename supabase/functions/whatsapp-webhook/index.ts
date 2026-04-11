import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const YAMPI_BASE = "https://api.dooki.com.br/v2";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== Yampi helpers =====
async function yampiGet(alias: string, path: string, token: string, secret: string, params: Record<string, string> = {}) {
  const url = new URL(`${YAMPI_BASE}/${alias}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", "User-Token": token, "User-Secret-Key": secret },
  });
  if (!res.ok) return null;
  return res.json();
}

async function lookupOrdersByCpf(tenantId: string, cpf: string): Promise<string> {
  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("provider", "yampi")
    .eq("is_active", true)
    .maybeSingle();

  if (!integration) return JSON.stringify({ error: "Integração Yampi não configurada." });

  const config = integration.config as any;
  const { alias, user_token, user_secret_key } = config;
  if (!alias || !user_token || !user_secret_key) return JSON.stringify({ error: "Credenciais Yampi incompletas." });

  const cleanCpf = cpf.replace(/\D/g, "");
  const searchRes = await yampiGet(alias, "customers", user_token, user_secret_key, { q: cleanCpf, limit: "5" });
  if (!searchRes?.data?.length) return JSON.stringify({ error: "Nenhum cliente encontrado com esse CPF.", cpf: cleanCpf });

  const yampiCustomer = searchRes.data.find((c: any) => (c.cpf || "").replace(/\D/g, "") === cleanCpf) || searchRes.data[0];
  const customerName = yampiCustomer.name || `${yampiCustomer.first_name || ""} ${yampiCustomer.last_name || ""}`.trim();

  const ordersRes = await yampiGet(alias, `customers/${yampiCustomer.id}/orders`, user_token, user_secret_key, { limit: "10", sort: "-created_at" });
  if (!ordersRes?.data?.length) return JSON.stringify({ customer_name: customerName, cpf: cleanCpf, orders: [], message: "Cliente encontrado, mas sem pedidos." });

  const statusLabels: Record<string, string> = {
    waiting_payment: "Aguardando pagamento", paid: "Pago", invoiced: "Faturado",
    shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado", refunded: "Reembolsado",
  };

  const orders = ordersRes.data.map((o: any) => {
    const status = o.status?.data?.alias || "pending";
    return {
      order_number: o.number || o.id,
      status: statusLabels[status] || status,
      total: o.value_total,
      created_at: o.created_at?.date || o.created_at,
      tracking_code: o.shipments?.data?.[0]?.tracking_code || null,
      tracking_url: o.shipments?.data?.[0]?.tracking_url || null,
      carrier: o.shipments?.data?.[0]?.carrier || null,
      payments: (o.payments?.data || []).map((p: any) => ({ method: p.payment_method?.name || "N/A", status: p.status })),
    };
  });

  return JSON.stringify({ customer_name: customerName, cpf: cleanCpf, orders_count: orders.length, orders });
}

const aiTools = [
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_by_cpf",
      description: "Consulta pedidos de um cliente pelo CPF na plataforma de e-commerce. Use quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento ou compras.",
      parameters: {
        type: "object",
        properties: { cpf: { type: "string", description: "CPF do cliente" } },
        required: ["cpf"],
      },
    },
  },
];

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

/** Download media from Meta Graph API and upload to Supabase Storage */
async function downloadAndStoreMedia(mediaId: string, mimeType: string, tenantId: string): Promise<string | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!metaRes.ok) {
      console.error(`[webhook] Failed to get media URL for ${mediaId}: ${metaRes.status}`);
      return null;
    }
    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    if (!downloadUrl) return null;

    const mediaRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!mediaRes.ok) {
      console.error(`[webhook] Failed to download media: ${mediaRes.status}`);
      return null;
    }
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

    if (uploadError) {
      console.error(`[webhook] Storage upload error:`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage.from("whatsapp-media").getPublicUrl(filePath);
    console.log(`[webhook] Media stored: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) {
    console.error(`[webhook] downloadAndStoreMedia error:`, err);
    return null;
  }
}

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

/** Auto-respond using AI if copilot is enabled for this customer */
async function tryAutoRespondWithAI(
  tenantId: string,
  customerId: string,
  phone: string,
  customerAttrs: Record<string, any> | null,
) {
  try {
    // AI is enabled by default; only skip if explicitly disabled
    const attrs = customerAttrs || {};
    if (attrs.ai_enabled === false) {
      console.log(`[webhook] AI disabled for customer ${customerId}`);
      return;
    }

    // Check if OpenAI integration is configured
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("tenant_id", tenantId)
      .eq("provider", "openai")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      console.log(`[webhook] No OpenAI integration for tenant ${tenantId}`);
      return;
    }

    const config = integration.config as any;
    const apiKey = config?.openai_api_key;
    if (!apiKey) {
      console.log(`[webhook] No OpenAI API key configured`);
      return;
    }

    // Fetch recent conversation history
    const { data: recentMsgs } = await supabase
      .from("whatsapp_messages")
      .select("direction, content, message_type, created_at")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(20);

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

    // Check if Yampi is configured
    const { data: yampiInt } = await supabase
      .from("integrations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider", "yampi")
      .eq("is_active", true)
      .maybeSingle();
    const hasYampi = !!yampiInt;

    const orderInstructions = hasYampi
      ? `\nVocê tem acesso à função lookup_orders_by_cpf para consultar pedidos. Quando o cliente perguntar sobre rastreio, entrega, status do pedido ou pagamento, solicite o CPF. Se o CPF já foi informado na conversa, use-o diretamente.`
      : "";

    const fullSystemPrompt = `${systemPrompt}

Tom de voz: ${toneInstructions[tone] || toneInstructions.friendly}
${extraContext ? `\nContexto adicional desta conversa: ${extraContext}` : ""}
${orderInstructions}

Você está respondendo automaticamente ao cliente via WhatsApp. Responda de forma natural e direta, como se fosse um atendente humano. Não use formatações como markdown. Seja breve e objetivo.`;

    // Build messages for OpenAI (reverse since we fetched desc)
    const chatMessages: any[] = [
      { role: "system", content: fullSystemPrompt },
      ...recentMsgs.reverse().map((m: any) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content || `[${m.message_type}]`,
      })),
    ];

    const openaiBody: any = {
      model,
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
    };
    if (hasYampi) {
      openaiBody.tools = aiTools;
      openaiBody.tool_choice = "auto";
    }

    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error(`[webhook] OpenAI error: ${openaiResponse.status} ${errText}`);
      return;
    }

    let result = await openaiResponse.json();
    let assistantMessage = result.choices?.[0]?.message;

    // Handle tool calls (up to 3 iterations)
    let iterations = 0;
    while (assistantMessage?.tool_calls?.length > 0 && iterations < 3) {
      iterations++;
      chatMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "lookup_orders_by_cpf") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[webhook] Tool call: lookup_orders_by_cpf(${args.cpf})`);
          const toolResult = await lookupOrdersByCpf(tenantId, args.cpf);
          chatMessages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult });
        }
      }

      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: chatMessages, max_tokens: 800, temperature: 0.7 }),
      });

      if (!openaiResponse.ok) {
        console.error("[webhook] OpenAI tool follow-up error:", openaiResponse.status);
        break;
      }

      result = await openaiResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    const aiReply = assistantMessage?.content?.trim();

    if (!aiReply) {
      console.log(`[webhook] OpenAI returned empty response`);
      return;
    }

    // Resolve phone_number_id for sending
    let phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .limit(1)
      .single();
    if (waAccount?.phone_number_id) phoneNumberId = waAccount.phone_number_id;

    // Send via WhatsApp
    const GRAPH_API = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
    const waResponse = await fetch(GRAPH_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: aiReply },
      }),
    });

    const waResult = await waResponse.json();
    if (!waResponse.ok) {
      console.error(`[webhook] Failed to send AI reply:`, waResult);
      return;
    }

    const wamid = waResult.messages?.[0]?.id;

    // Save the AI reply as outbound message
    await supabase.from("whatsapp_messages").insert({
      tenant_id: tenantId,
      customer_id: customerId,
      phone,
      direction: "outbound",
      message_type: "text",
      content: aiReply,
      wamid,
      status: "sent",
      metadata: { ai_generated: true },
    });

    console.log(`[webhook] AI auto-reply sent to ${phone}`);
  } catch (err) {
    console.error(`[webhook] AI auto-respond error:`, err);
  }
}

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
    try {
      const body = await req.json();
      console.log("[webhook] POST received");

      const entries = body?.entry;
      if (!entries || !Array.isArray(entries)) {
        return new Response("OK", { status: 200 });
      }

      for (const entry of entries) {
        const changes = entry?.changes;
        if (!changes || !Array.isArray(changes)) continue;

        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          const tenantId = await resolveTenantByPhoneNumberId(phoneNumberId || "");
          if (!tenantId) {
            console.error("[webhook] Could not resolve tenant for:", phoneNumberId);
            continue;
          }

          // Handle status updates
          if (value.statuses && Array.isArray(value.statuses)) {
            for (const status of value.statuses) {
              const { id: wamid, status: msgStatus } = status;
              await supabase.from("whatsapp_messages").update({ status: msgStatus }).eq("wamid", wamid);
              await propagateStatusToActivity(wamid, msgStatus);
            }
          }

          // Handle incoming messages
          if (value.messages && Array.isArray(value.messages)) {
            const contact = value.contacts?.[0];

            for (const message of value.messages) {
              const phone = message.from;
              const wamid = message.id;
              const msgType = message.type || "text";

              let content = "";
              let mediaUrl: string | null = null;

              switch (msgType) {
                case "text":
                  content = message.text?.body || "";
                  break;
                case "image":
                case "video":
                case "audio":
                case "document": {
                  const mediaData = message[msgType];
                  content = mediaData?.caption || "";
                  const mediaId = mediaData?.id;
                  const mimeType = mediaData?.mime_type || "application/octet-stream";
                  if (mediaId) {
                    mediaUrl = await downloadAndStoreMedia(mediaId, mimeType, tenantId);
                  }
                  if (msgType === "document" && mediaData?.filename) {
                    content = content || mediaData.filename;
                  }
                  break;
                }
                case "sticker": {
                  const stickerId = message.sticker?.id;
                  const stickerMime = message.sticker?.mime_type || "image/webp";
                  if (stickerId) {
                    mediaUrl = await downloadAndStoreMedia(stickerId, stickerMime, tenantId);
                  }
                  content = "[Sticker]";
                  break;
                }
                case "reaction":
                  content = message.reaction?.emoji || "";
                  break;
                case "location":
                  content = `📍 ${message.location?.latitude},${message.location?.longitude}`;
                  break;
                default:
                  content = `[${msgType}]`;
              }

              // Find or create customer
              let customer = await findCustomerByPhone(phone, tenantId);
              if (!customer) {
                const customerName = contact?.profile?.name || phone;
                const { data: newCustomer, error: createError } = await supabase
                  .from("customers")
                  .insert({ name: customerName, phone, tenant_id: tenantId, is_lead: true })
                  .select("id, tenant_id, name, phone, custom_attributes")
                  .single();
                if (createError) { console.error("[webhook] Create customer error:", createError); continue; }
                customer = newCustomer;
              }

              // Save message with resolved media URL
              await supabase.from("whatsapp_messages").insert({
                tenant_id: tenantId,
                customer_id: customer!.id,
                phone,
                direction: "inbound",
                message_type: msgType === "sticker" ? "image" : msgType,
                content,
                media_url: mediaUrl,
                wamid,
                status: "received",
                metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name },
              });

              await markRepliedActivity(customer!.id, tenantId);
              console.log(`[webhook] Saved ${msgType} from ${phone}${mediaUrl ? " (with media)" : ""}`);

              // Try AI auto-response (async, don't block webhook)
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
