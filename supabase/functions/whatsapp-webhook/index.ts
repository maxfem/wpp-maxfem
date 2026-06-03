import { createClient } from "npm:@supabase/supabase-js";
import { emitConversationCreated } from "../_shared/automation-emitters.ts";

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

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime",
  aac: "audio/aac", m4a: "audio/mp4", mp3: "audio/mpeg", amr: "audio/amr", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

// Lê imagem/áudio/vídeo/documento que o cliente mandou e devolve uma descrição/transcrição via Gemini,
// pra IA conseguir responder de verdade em vez de "não consigo visualizar".
async function analyzeMediaWithGemini(tenantId: string, storagePath: string, mimeTypeHint: string | null, msgType: string): Promise<string | null> {
  try {
    const { data: geminiInt } = await supabase
      .from("integrations").select("config")
      .eq("tenant_id", tenantId).eq("provider", "gemini").eq("is_active", true).maybeSingle();
    const gcfg = (geminiInt?.config || {}) as any;
    const gKey = gcfg.api_key;
    if (!gKey) return null;
    const model = String(gcfg.model || "gemini-2.5-flash").replace(/^google\//, "");

    const { data: blob, error } = await supabase.storage.from("whatsapp-media").download(storagePath);
    if (error || !blob) { console.error("[webhook] media download for analysis failed:", error); return null; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 18 * 1024 * 1024) return null; // inline tem limite; pula arquivos grandes

    const ext = (storagePath.split(".").pop() || "").toLowerCase();
    const mimeType = mimeTypeHint || EXT_TO_MIME[ext] || (blob.type) || "application/octet-stream";

    const promptByType: Record<string, string> = {
      audio: "Transcreva este áudio em português, do começo ao fim. Se não houver fala compreensível, responda apenas '[áudio sem fala compreensível]'.",
      image: "Você é assistente de atendimento. Descreva de forma objetiva e curta o que o cliente enviou nesta imagem e TRANSCREVA qualquer texto visível (número de pedido, código de rastreio, valores, nomes, datas, prints de conversa). Não invente nada. Português.",
      video: "Descreva de forma objetiva e curta o que aparece neste vídeo enviado pelo cliente e transcreva qualquer fala relevante. Não invente nada. Português.",
      document: "Resuma de forma objetiva e curta o conteúdo deste documento enviado pelo cliente, transcrevendo dados relevantes (números, valores, nomes, datas). Não invente nada. Português.",
    };
    const instruction = promptByType[msgType] || promptByType.image;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }, { inline_data: { mime_type: mimeType, data: bytesToBase64(bytes) } }] }],
        // thinkingBudget 0 = sem "raciocínio" do 2.5-flash consumindo os tokens de saída (senão a resposta vem truncada)
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok) { console.error("[webhook] Gemini media analysis HTTP", res.status, (await res.text()).slice(0, 300)); return null; }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(" ").trim();
    return text || null;
  } catch (e) {
    console.error("[webhook] analyzeMediaWithGemini error:", e);
    return null;
  }
}

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
      .eq("channel", "whatsapp")
      .is("delivered_at", null).gte("sent_at", cutoff);
  } else if (status === "read") {
    await supabase.from("campaign_activities").update({ read_at: now })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .eq("channel", "whatsapp")
      .is("read_at", null).gte("sent_at", cutoff);
  } else if (status === "failed") {
    await supabase.from("campaign_activities").update({ status: "failed" })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .eq("channel", "whatsapp")
      .eq("status", "pending").gte("sent_at", cutoff);
  }
}

async function markRepliedActivity(customerId: string, tenantId: string) {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await supabase.from("campaign_activities").update({ replied_at: now })
    .eq("customer_id", customerId).eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .is("replied_at", null).gte("sent_at", cutoff);
}

// Quando o cliente responde, avança qualquer automação que estava parada
// no estado "waiting_reply" pro branch "Se responder" (out-1) do nó de WhatsApp.
// Sem branch out-1 → encerra o item (cliente respondeu, mas o fluxo não tem
// caminho de resposta definido).
// Retorna true se a resposta do cliente foi "consumida" por alguma automação
// (avançou um item que estava aguardando resposta). Nesse caso a IA NÃO deve
// responder — quem fala é a automação.
async function advanceWaitingReplyAutomations(customerId: string, tenantId: string): Promise<boolean> {
  const { data: items } = await supabase
    .from("automation_queue")
    .select("id, campaign_id, current_node_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("status", "waiting_reply");

  if (!items || items.length === 0) return false;

  let advancedAny = false;
  for (const item of items) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("flow_data")
      .eq("id", item.campaign_id)
      .maybeSingle();
    const edges = ((campaign?.flow_data as any)?.edges || []) as Array<{ source: string; target: string; sourceHandle?: string }>;
    const waitNodeId = item.current_node_id;
    const replyEdge = edges.find((e) => e.source === waitNodeId && e.sourceHandle === "out-1");
    const cleanedMeta = { ...((item.metadata as any) || {}) };
    delete cleanedMeta.waiting_for_reply;
    delete cleanedMeta.wait_node_id;

    if (replyEdge?.target) {
      const { error } = await supabase.from("automation_queue").update({
        status: "pending",
        current_node_id: replyEdge.target,
        scheduled_for: null,
        metadata: cleanedMeta,
      }).eq("id", item.id).eq("status", "waiting_reply");
      if (!error) {
        advancedAny = true;
        console.log(`[webhook] Automação ${item.id} avançou pro "Se responder" (${replyEdge.target})`);
      } else {
        console.error(`[webhook] Falha ao avançar automação ${item.id}:`, error.message);
      }
    } else {
      await supabase.from("automation_queue").update({
        status: "completed",
        processed_at: new Date().toISOString(),
        metadata: cleanedMeta,
      }).eq("id", item.id).eq("status", "waiting_reply");
      console.log(`[webhook] Automação ${item.id} encerrada — resposta recebida, sem branch out-1`);
    }
  }

  // Dispara o executor pro tenant pra a próxima etapa rodar na hora
  // (ex: enviar o código Pix), sem esperar o cron.
  if (advancedAny) {
    const execTask = fetch(`${SUPABASE_URL}/functions/v1/campaign-executor`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "reply", tenant_id: tenantId }),
    }).catch((e) => console.error("[webhook] executor invoke (reply) error:", e));
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(execTask);
  }

  // Havia automação aguardando a resposta deste cliente → a resposta pertence
  // à automação, a IA não deve responder este turno.
  return true;
}

// Decide se a IA de atendimento deve ficar quieta porque uma automação está
// no controle da conversa. Regra (definida pelo Mestre):
//   - Se a resposta do cliente avançou uma automação → IA quieta.
//   - Se uma automação mandou mensagem pra este cliente nos últimos 5 min →
//     IA quieta. Depois de 5 min sem automação, a IA pode atender dúvidas.
async function isAutomationHandlingCustomer(customerId: string, tenantId: string): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentAct } = await supabase
    .from("campaign_activities")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("channel", "whatsapp")
    .eq("status", "sent")
    .gte("sent_at", fiveMinAgo)
    .limit(1);
  return !!(recentAct && recentAct.length > 0);
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

  const formattedOrders = orders.map((o: any) => {
    const trackingCode = o.tracking_code || null;
    return {
      order_number: o.order_number || o.external_id?.replace("yampi_", "") || o.id,
      status: statusLabels[o.status_alias || o.status] || o.status,
      status_alias: o.status_alias || o.status,
      total: o.total, created_at: o.created_at,
      tracking_code: trackingCode,
      tracking_url: trackingCode ? `http://rastreio.maxfem.com.br/${trackingCode}` : null,
      carrier: o.carrier || null, payments: o.payment_summary || [], items: o.items_summary || [],
    };
  });

  return JSON.stringify({ customer_name: customer.name, cpf: cleanCpf, orders_count: formattedOrders.length, orders: formattedOrders,
    note: "Dados sincronizados da plataforma. Se o rastreio não aparece, pode estar pendente de atualização na origem." });
}

// ===== BLING INTEGRATION =====

async function refreshBlingToken(integrationId: string, cfg: any): Promise<string | null> {
  // Prioriza client_id/secret salvos na config da integração (igual ao bling-auth);
  // as env vars são apenas fallback e nem sempre estão setadas nas edge functions.
  const clientId = cfg?.client_id || Deno.env.get("BLING_CLIENT_ID");
  const clientSecret = cfg?.client_secret || Deno.env.get("BLING_CLIENT_SECRET");
  if (!clientId || !clientSecret || !cfg?.refresh_token) {
    console.error("[webhook] Bling refresh: faltam client_id/client_secret/refresh_token");
    return null;
  }

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://api.bling.com.br/Api/v3/oauth/token", {
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

    let contactRes = await fetch(`https://api.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (contactRes.status === 401) {
      const newToken = await refreshBlingToken(blingIntegration.id, cfg);
      if (newToken) {
        accessToken = newToken;
        contactRes = await fetch(`https://api.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
      }
    }

    if (!contactRes.ok) return JSON.stringify({ error: "Erro ao consultar Bling." });

    const contactData = await contactRes.json();
    let contacts = contactData?.data || [];

    // Fallback: alguns cadastros não batem no "pesquisa" formatado — tenta pelo numeroDocumento (só dígitos)
    if (contacts.length === 0) {
      try {
        const altRes = await fetch(`https://api.bling.com.br/Api/v3/contatos?numeroDocumento=${encodeURIComponent(cleanCpf)}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (altRes.ok) contacts = (await altRes.json())?.data || [];
      } catch (_) { /* ignore */ }
    }
    if (contacts.length === 0) return JSON.stringify({ error: "Nenhum cliente encontrado no Bling com esse CPF.", cpf: formattedCpf });

    // Pode haver mais de um contato com o mesmo CPF — pega o primeiro que tiver pedidos
    let contactName = contacts[0].nome;
    let ordersList: any[] = [];
    for (const c of contacts.slice(0, 3)) {
      let ordersRes = await fetch(`https://api.bling.com.br/Api/v3/pedidos/vendas?idContato=${c.id}&limit=5`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!ordersRes.ok && ordersRes.status >= 500) {
        await new Promise((r) => setTimeout(r, 600));
        ordersRes = await fetch(`https://api.bling.com.br/Api/v3/pedidos/vendas?idContato=${c.id}&limit=5`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
      }
      if (!ordersRes.ok) continue;
      const list = (await ordersRes.json())?.data || [];
      if (list.length > 0) { contactName = c.nome; ordersList = list; break; }
    }
    if (ordersList.length === 0) return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Cliente encontrado no Bling, mas sem pedidos vinculados a esse CPF." });

    const detailedOrders = [];
    for (const order of ordersList.slice(0, 5)) {
      const detailRes = await fetch(`https://api.bling.com.br/Api/v3/pedidos/vendas/${order.id}`, {
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
          const nfeRes = await fetch(`https://api.bling.com.br/Api/v3/nfe/${d.notaFiscal.id}`, {
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
          const logRes = await fetch(`https://api.bling.com.br/Api/v3/pedidos/vendas/${order.id}/logistica`, {
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

      // SEMPRE usar domínio próprio Maxfem; NUNCA expor URL de transportadora
      if (trackingCode) {
        trackingUrl = `http://rastreio.maxfem.com.br/${trackingCode}`;
      } else {
        trackingUrl = null;
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
  {
    type: "function" as const,
    function: {
      name: "flag_for_human_review",
      description: "Sinaliza esta conversa como prioritária para revisão humana — MAS você (Ana) continua respondendo normalmente. Use quando: reclamação séria, cancelamento/reembolso/troca, problema de pagamento, dúvida técnica/jurídica/médica, ameaça de processo, ou cliente claramente irritado pedindo humano. NÃO pare de atender; apenas sinalize internamente que o time humano deve dar uma olhada na conversa em paralelo. Depois de chamar essa função, RESPONDA NORMALMENTE ao cliente com acolhimento — você é quem dá a última palavra até o assunto resolver.",
      parameters: { type: "object", properties: { reason: { type: "string", description: "Motivo curto pra revisão humana" } }, required: ["reason"] },
    },
  },
];

async function flagForHumanReview(customerId: string, reason: string): Promise<string> {
  try {
    const { data: cust } = await supabase.from("customers").select("custom_attributes").eq("id", customerId).maybeSingle();
    const attrs = { ...((cust?.custom_attributes as any) || {}) };
    // IMPORTANTE: NÃO desliga ai_enabled — IA continua respondendo (regra: última palavra sempre da IA até resolvido)
    attrs.needs_human_review = true;
    attrs.flagged_at = new Date().toISOString();
    attrs.flag_reason = String(reason || "").slice(0, 300);
    await supabase.from("customers").update({ custom_attributes: attrs }).eq("id", customerId);
    console.log(`[webhook] Flagged ${customerId} for human REVIEW (IA continues): ${reason}`);
    return JSON.stringify({
      ok: true,
      instruction: "Conversa sinalizada para revisão humana. IMPORTANTE: você CONTINUA atendendo normalmente. Agora responda ao cliente com acolhimento ('estou anotando aqui, vou priorizar' / 'já estou olhando o seu caso') e tente resolver o que puder. NUNCA diga que vai 'passar pra um atendente' nem que 'alguém vai retornar' — VOCÊ é a Ana e VOCÊ vai resolver junto com o cliente.",
    });
  } catch (e) {
    console.error("[webhook] flagForHumanReview error:", e);
    return JSON.stringify({ ok: false, instruction: "Responda ao cliente normalmente com acolhimento e tente ajudar. Não prometa transferência humana." });
  }
}

async function tryAutoRespondWithAI(tenantId: string, customerId: string, phone: string, customerAttrs: Record<string, any> | null) {
  try {
    const attrs = customerAttrs || {};
    // Regra Maxfem: IA dá a última palavra até resolver. Só silencia se humano explicitamente assumir
    // (custom_attributes.human_taken_over = true) — diferente do antigo ai_enabled=false que era setado
    // automaticamente em escalation.
    if (attrs.human_taken_over === true) {
      console.log(`[webhook] AI skipped — human took over conversation ${customerId}`);
      return;
    }
    if (attrs.ai_enabled === false && attrs.human_taken_over !== false) {
      // Legacy ai_enabled=false vinda de escalations antigas: ignora (IA volta a responder).
      // Logado pra auditoria.
      console.log(`[webhook] Ignoring legacy ai_enabled=false for ${customerId} — IA volta a atender`);
    }

    // CPF já conhecido do cliente (sincronizado da Yampi) — evita ter que pedir
    let knownCpf = String(attrs.cpf || attrs.document || "").replace(/\D/g, "");
    if (knownCpf.length !== 11) {
      try {
        const { data: cust } = await supabase.from("customers").select("document").eq("id", customerId).maybeSingle();
        const d = String(cust?.document || "").replace(/\D/g, "");
        if (d.length === 11) knownCpf = d;
      } catch { /* ignore */ }
    }
    if (knownCpf.length !== 11) knownCpf = "";

    // Provedor de IA: Gemini (prioridade) > OpenAI (fallback legado).
    // Ambos usam o endpoint OpenAI-compatível, então o resto do fluxo (tools, loop) é idêntico.
    const { data: geminiIntegration } = await supabase
      .from("integrations").select("config")
      .eq("tenant_id", tenantId).eq("provider", "gemini").eq("is_active", true).maybeSingle();

    let integration = geminiIntegration;
    const useGemini = !!geminiIntegration;
    if (!integration) {
      const { data: openaiIntegration } = await supabase
        .from("integrations").select("config")
        .eq("tenant_id", tenantId).eq("provider", "openai").eq("is_active", true).maybeSingle();
      integration = openaiIntegration;
    }
    if (!integration) { console.log(`[webhook] Nenhum provedor de IA (gemini/openai) ativo para tenant ${tenantId} — auto-resposta off`); return; }

    const config = integration.config as any;
    if (config?.ai_enabled === false) return; // toggle global do atendimento IA

    const aiEndpoint = useGemini
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const apiKey = useGemini
      ? (config?.api_key || Deno.env.get("GEMINI_API_KEY") || "")
      : (config?.openai_api_key || "");
    if (!apiKey) { console.log(`[webhook] ${useGemini ? "Gemini" : "OpenAI"} sem API key para tenant ${tenantId} — auto-resposta off`); return; }

    const { data: recentMsgs } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, content, message_type, media_url, metadata, created_at")
      .eq("tenant_id", tenantId).eq("phone", phone)
      .order("created_at", { ascending: false }).limit(20);

    if (!recentMsgs || recentMsgs.length === 0) return;

    // Safety net: se a mídia mais recente do cliente ainda não foi analisada (passo do webhook
    // falhou, ou mensagem antiga), analisa agora com Gemini pra IA não responder "não consigo ver".
    const mediaTypes = ["image", "video", "audio", "document"];
    const lastUnanalyzed = recentMsgs.find((m: any) =>
      m.direction === "inbound" && m.media_url && mediaTypes.includes(m.message_type) && !m.metadata?.media_analysis);
    if (lastUnanalyzed) {
      try {
        const analysis = await analyzeMediaWithGemini(tenantId, lastUnanalyzed.media_url, lastUnanalyzed.metadata?.mime_type || null, lastUnanalyzed.message_type);
        if (analysis) {
          const newMeta = { ...(lastUnanalyzed.metadata || {}), media_analysis: analysis };
          await supabase.from("whatsapp_messages").update({ metadata: newMeta }).eq("id", lastUnanalyzed.id);
          lastUnanalyzed.metadata = newMeta;
        }
      } catch (e) { console.error("[webhook] lazy media analysis error:", e); }
    }

    const tone = attrs.ai_tone && attrs.ai_tone !== "default" ? attrs.ai_tone : (config.tone || "friendly");
    const model = useGemini
      ? String(config.model || "gemini-2.5-flash").replace(/^google\//, "")
      : (config.model || "gpt-4o-mini");
    const systemPrompt = config.whatsapp_prompt || config.system_prompt || "Você é a Ana, atendente da Maxfem. Atende clientes pelo WhatsApp de forma acolhedora e objetiva.";
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
    // Bling é a fonte de verdade (tem TODOS os pedidos + rastreio em tempo real). O lookup local (Yampi)
    // é um subconjunto incompleto — só usa se não tiver Bling.
    if (hasBling) activeTools.push(aiTools[1]);
    else if (hasYampi) activeTools.push(aiTools[0]);
    activeTools.push(aiTools[2]); // flag_for_human_review — sempre disponível (sinalização interna, IA continua respondendo)

    const lookupFn = hasBling ? "lookup_orders_bling" : (hasYampi ? "lookup_orders_by_cpf" : "");
    let orderInstructions = "";
    if (hasOrderTools) {
      orderInstructions = `\nQuando o cliente perguntar sobre pedido / rastreio / entrega / "quando vai chegar" / "comprei e quero saber...", você DEVE consultar com a função ${lookupFn} (ela exige o CPF, só dígitos).
${knownCpf
  ? `O CPF cadastrado deste cliente é ${knownCpf}. Use-o DIRETO em ${lookupFn} — NÃO precisa pedir o CPF.`
  : `Você ainda NÃO tem o CPF deste cliente. Peça primeiro de forma natural (ex.: "Claro! Me passa seu CPF, só os números, que eu localizo seu pedido aqui."). Assim que o cliente mandar um CPF com 11 dígitos, CHAME ${lookupFn} com esse CPF — não fique enrolando. NUNCA invente, chute ou complete um CPF.`}
SEMPRE use ${lookupFn} pra responder sobre pedido/rastreio — nunca responda status/prazo/rastreio de cabeça.
Se ${lookupFn} retornar erro ou "sem pedidos": peça desculpas, peça pro cliente CONFERIR se digitou o CPF certo e mandar de novo; se na segunda tentativa ainda não achar, chame flag_for_human_review (sinalização interna — você CONTINUA atendendo) e diga ao cliente que está investigando junto com o time, pra ele te mandar o e-mail ou número do pedido pra você localizar. NUNCA responda só "tive um problema" nem prometa que alguém vai retornar.

REGRAS sobre rastreio (INEGOCIÁVEIS):
- Quando informar rastreio, escreva apenas: "Link para rastreamento: http://rastreio.maxfem.com.br/{tracking_code}"
- NUNCA use Markdown como [texto](url). Sempre URL CRUA.
- NUNCA envolva a URL com parênteses, colchetes ou aspas.
- NUNCA use URLs de transportadoras (Loggi, Correios, Jadlog, FM, Melhor Envio).
- Use SEMPRE http://rastreio.maxfem.com.br/{tracking_code} (note: http, não https).
- NUNCA modifique o tracking_code. Copie-o EXATAMENTE como veio (incluindo "_" e "-").
- SOMENTE diga "código de rastreio ainda não disponível" quando tracking_code for null.
- Nunca invente informações.`;
    }

    const guardrails = `

REGRAS CRÍTICAS (inegociáveis):
- Você responde DIRETO ao cliente final no WhatsApp (não a um atendente). Fale na primeira pessoa, como a Ana da Maxfem. Seja didática e paciente: explique com calma, sem pressa, sem jargão; aguente dúvida repetida e erro de digitação sem tratar como óbvio.
- INTENÇÃO DE COMPRA = MANDA O LINK NA HORA. Se o cliente disser que quer comprar / quanto custa / como pede / "me manda o link" / "quero esse", responda já com o LINK do produto na própria mensagem, com os UTM (utm_source=whatsapp&utm_medium=atendente-ia&utm_campaign=atendimento). Nunca diga só "visite nosso site" sem o link; nunca fique perguntando o que ele quer saber quando ele já disse que quer comprar.
- NUNCA invente ou "chute" nada: status de pedido, prazos, valores, código de rastreio, políticas, composição de produto, indicação de uso, etc. Se não tem certeza, não responda de cabeça.
- VOCÊ é a Ana e VOCÊ dá a última palavra até o assunto se resolver. NUNCA prometa "passar pra um atendente", "alguém vai retornar", "vou transferir você". Você está aqui, você atende.
- Se a pergunta fugir do que você sabe com segurança — reclamação séria, cancelamento/reembolso/troca, problema de pagamento, dúvida técnica/jurídica/médica — chame a função flag_for_human_review (sinalização interna pro time monitorar) e CONTINUE atendendo o cliente normalmente. Use frases como "estou anotando isso aqui pra priorizar com o time", "vou conferir junto com o pessoal e te confirmo já já", "me conta mais pra eu entender o que aconteceu". Acolha, peça mais informações, ofereça caminhos. Você é resolução, não transferência.
- Se o cliente pedir explicitamente um humano, valide o sentimento ("entendo, você quer falar com alguém do time, sem problema") + chame flag_for_human_review + continue tentando ajudar você mesma ("enquanto isso, me conta o que está acontecendo? Talvez eu já resolva agora").
- Para reclamação ou raiva: NUNCA fique em loop "não consegui". Acolha de verdade ("imagino sua frustração"), peça contexto (e-mail/pedido/data), proponha um próximo passo concreto e dê um prazo seu mesmo (ex: "vou verificar isso hoje ainda e te trago a posição até amanhã às 18h"). Você ASSUME a resolução.
- Quando o cliente enviar imagem, áudio, vídeo ou documento, o conteúdo já vem transcrito/descrito no histórico entre colchetes (ex.: "[O cliente enviou uma imagem. Conteúdo: ...]") — use isso normalmente, não diga que "não consegue ver". Se aparecer "não foi possível ler", aí sim peça pro cliente descrever em texto ou encaminhe pra um humano.
- Não prometa prazos de resultado de produto nem faça promessas de cura/tratamento.`;

    const fullSystemPrompt = `${systemPrompt}\n\nTom de voz: ${toneInstructions[tone] || toneInstructions.friendly}${extraContext ? `\nContexto adicional desta conversa: ${extraContext}` : ""}${orderInstructions}${guardrails}\n\nResponda de forma natural, breve e direta. Não use markdown.`;

    const ptMediaName: Record<string, string> = {
      image: "uma imagem/foto", video: "um vídeo", audio: "um áudio", document: "um documento",
    };
    const chatMessages: any[] = [
      { role: "system", content: fullSystemPrompt },
      ...recentMsgs.reverse().map((m: any) => {
        const role = m.direction === "inbound" ? "user" : "assistant";
        let c = (m.content || "").trim();
        const analysis = m.metadata?.media_analysis;
        if (analysis) {
          const what = ptMediaName[m.message_type] || "um arquivo";
          c = c ? `${c}\n[O cliente enviou ${what}. Conteúdo: ${analysis}]` : `[O cliente enviou ${what}. Conteúdo: ${analysis}]`;
        } else if (!c && mediaTypes.includes(m.message_type)) {
          c = `[O cliente enviou ${ptMediaName[m.message_type] || "um arquivo"} que não foi possível ler automaticamente]`;
        } else if (!c) {
          c = `[${m.message_type}]`;
        }
        return { role, content: c };
      }),
    ];

    const openaiBody: any = { model, messages: chatMessages, max_tokens: 500, temperature: 0.7 };
    if (activeTools.length > 0) { openaiBody.tools = activeTools; openaiBody.tool_choice = "auto"; }

    console.log(`[webhook] AI auto-reply via ${useGemini ? "gemini" : "openai"} (${model}) → ${phone}`);

    let openaiResponse = await fetch(aiEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiResponse.ok) { console.error(`[webhook] ${useGemini ? "Gemini" : "OpenAI"} error ${openaiResponse.status}:`, (await openaiResponse.text()).slice(0, 500)); return; }

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
        else if (toolCall.function.name === "flag_for_human_review") toolResult = await flagForHumanReview(customerId, args.reason);
        else toolResult = JSON.stringify({ error: "função desconhecida" });
        chatMessages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult });
      }

      openaiResponse = await fetch(aiEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: chatMessages, max_tokens: 800, temperature: 0.7, tools: activeTools, tool_choice: "auto" }),
      });

      if (!openaiResponse.ok) { console.error(`[webhook] ${useGemini ? "Gemini" : "OpenAI"} tool-loop error ${openaiResponse.status}:`, (await openaiResponse.text()).slice(0, 500)); break; }
      result = await openaiResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    const rawReply = assistantMessage?.content?.trim();
    if (!rawReply) return;

    // Sanitização canônica de tracking (mesma regra do ai-copilot)
    const aiReply = rawReply
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$2")
      .replace(/\((https?:\/\/[^)\s]+)\)/g, "$1")
      .replace(/\[(https?:\/\/[^\]\s]+)\]/g, "$1")
      .replace(/[*\-]\s*(https?:\/\/)/g, "$1")
      .replace(
        /https?:\/\/(?:www\.)?(?:loggi\.com|correios\.com\.br|jadlog\.com\.br|melhorenvio\.com\.br|linkcorreios\.com\.br|fmtransportes\.com\.br)\/[^\s)]*?([A-Za-z0-9_-]{8,})[^\s)]*/gi,
        "http://rastreio.maxfem.com.br/$1",
      )
      .replace(/(https?:\/\/[^\s]+?)[)\]\.,;:!?*]+(?=\s|$)/g, "$1");

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
      metadata: { ai_generated: true, ai_provider: useGemini ? "gemini" : "openai", ai_model: model },
    });

    console.log(`[webhook] AI auto-reply sent to ${phone} (${useGemini ? "gemini" : "openai"})`);
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
              const { id: wamid, status: msgStatus, errors } = status;
              // Persiste errors[] do Meta em metadata pra diagnóstico de mensagens failed.
              const update: any = { status: msgStatus };
              if (errors && Array.isArray(errors) && errors.length > 0) {
                update.metadata = {
                  errors: errors.map((e: any) => ({
                    code: e.code, title: e.title,
                    message: e.message, details: e.error_data?.details || e.details,
                    href: e.href,
                  })),
                  failed_at: new Date().toISOString(),
                };
                console.log(`[webhook] WA status=failed wamid=${wamid} errors=${JSON.stringify(errors)}`);
              }
              await supabase.from("whatsapp_messages").update(update).eq("wamid", wamid);
              await propagateStatusToActivity(wamid, msgStatus);
              // Propaga o motivo do erro pra campaign_activities.error_message (do customer+tenant correspondente)
              if (msgStatus === "failed" && errors && errors.length > 0) {
                const errMsg = errors.map((e: any) => `(#${e.code}) ${e.title || e.message || ""}`.trim()).join(" | ");
                const { data: wm } = await supabase.from("whatsapp_messages")
                  .select("customer_id, tenant_id, created_at").eq("wamid", wamid).maybeSingle();
                if (wm?.customer_id) {
                  const cutoff = new Date(new Date(wm.created_at).getTime() - 5 * 60 * 1000).toISOString();
                  await supabase.from("campaign_activities")
                    .update({ status: "failed", error_message: errMsg })
                    .eq("customer_id", wm.customer_id).eq("tenant_id", wm.tenant_id)
                    .eq("channel", "whatsapp")
                    .gte("sent_at", cutoff);
                }
              }
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
              let mediaMime: string | null = null;

              switch (msgType) {
                case "text": content = message.text?.body || ""; break;
                case "image": case "video": case "audio": case "document": {
                  const mediaData = message[msgType];
                  content = mediaData?.caption || "";
                  const mediaId = mediaData?.id;
                  mediaMime = mediaData?.mime_type || "application/octet-stream";
                  if (mediaId) mediaUrl = await downloadAndStoreMedia(mediaId, mediaMime, tenantId);
                  if (msgType === "document" && mediaData?.filename) content = content || mediaData.filename;
                  break;
                }
                case "sticker": {
                  const stickerId = message.sticker?.id;
                  mediaMime = message.sticker?.mime_type || "image/webp";
                  if (stickerId) mediaUrl = await downloadAndStoreMedia(stickerId, mediaMime, tenantId);
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

              const { data: insertedMsg } = await supabase.from("whatsapp_messages").insert({
                tenant_id: tenantId, customer_id: customer!.id, phone, direction: "inbound",
                message_type: msgType === "sticker" ? "image" : msgType, content, media_url: mediaUrl,
                wamid, status: "received",
                metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name, ...(mediaMime ? { mime_type: mediaMime } : {}) },
              }).select("id").single();

              await markRepliedActivity(customer!.id, tenantId);
              // Avança automações paradas aguardando resposta (branch "Se responder")
              const automationConsumedReply = await advanceWaitingReplyAutomations(customer!.id, tenantId);
              console.log(`[webhook] Saved ${msgType} from ${phone}${mediaUrl ? " (with media)" : ""}`);

              // Detectar se é a primeira mensagem inbound deste cliente (nova conversa)
              if (insertedMsg?.id) {
                const { count } = await supabase
                  .from("whatsapp_messages")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", tenantId)
                  .eq("customer_id", customer!.id)
                  .eq("direction", "inbound");

                if (count === 1) {
                  // É a primeira mensagem inbound - nova conversa criada
                  console.log(`[webhook] New conversation detected for customer ${customer!.id}`);
                  await emitConversationCreated(supabase, tenantId, customer!.id, phone, insertedMsg.id);
                }
              }

              // Mídia recebida → analisa com Gemini (visão/transcrição) e guarda no metadata,
              // pra IA (e os atendentes) conseguirem responder de verdade. Feito ANTES da auto-resposta.
              if (mediaUrl && insertedMsg?.id && ["image", "video", "audio", "document"].includes(msgType)) {
                try {
                  const analysis = await analyzeMediaWithGemini(tenantId, mediaUrl, mediaMime, msgType);
                  if (analysis) {
                    await supabase.from("whatsapp_messages")
                      .update({ metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name, ...(mediaMime ? { mime_type: mediaMime } : {}), media_analysis: analysis } })
                      .eq("id", insertedMsg.id);
                  }
                } catch (e) { console.error("[webhook] media analysis step error:", e); }
              }

              // === Onda 1: STOP keyword detection (LGPD/CAN-SPAM compliance) ===
              if (msgType === "text" && content) {
                const normalized = content.trim().toLowerCase();
                const stopKeywords = ["sair", "parar", "cancelar", "stop", "unsubscribe", "descadastrar", "remover", "nao quero mais", "não quero mais"];
                if (stopKeywords.some(k => normalized === k || normalized.startsWith(k + " ") || normalized.startsWith(k + "."))) {
                  console.log(`[webhook] STOP keyword detected from ${phone}: "${content}"`);
                  await supabase.from("contact_blocklist").upsert({
                    tenant_id: tenantId, channel: "whatsapp", identifier: phone,
                    reason: "stop_keyword", source: `inbound:"${content.slice(0, 100)}"`,
                    customer_id: customer!.id,
                  }, { onConflict: "tenant_id,channel,identifier" });

                  // Resposta automática de confirmação (free-form, dentro da janela 24h)
                  try {
                    const { data: waAccount } = await supabase.from("whatsapp_accounts")
                      .select("phone_number_id, access_token").eq("tenant_id", tenantId).eq("is_active", true).single();
                    if (waAccount) {
                      await fetch(`https://graph.facebook.com/v22.0/${waAccount.phone_number_id}/messages`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${waAccount.access_token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                          messaging_product: "whatsapp", to: phone, type: "text",
                          text: { body: "✅ Você foi descadastrado das nossas mensagens promocionais. Não enviaremos mais campanhas para este número. Para voltar a receber, responda VOLTAR." }
                        }),
                      });
                    }
                  } catch (e) { console.error("[webhook] STOP confirmation send error:", e); }
                  continue; // não dispara IA
                }

                // Reativação
                if (normalized === "voltar" || normalized === "reativar" || normalized === "subscribe") {
                  await supabase.from("contact_blocklist")
                    .delete().eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("identifier", phone);
                  console.log(`[webhook] Reactivation requested from ${phone}`);
                }
              }

              // GATE DA IA: se uma automação está atendendo o cliente, a IA
              // fica quieta. Evita a IA falar por cima do código Pix etc.
              const automationActive =
                automationConsumedReply ||
                (await isAutomationHandlingCustomer(customer!.id, tenantId));

              if (automationActive) {
                console.log(`[webhook] IA suprimida — automação no controle da conversa com ${phone}`);
              } else {
                // FIRE-AND-FORGET: chama whatsapp-ai-respond dedicada
                // Isso libera o webhook rapidamente pro Meta (evita timeout)
                // e a edge function dedicada tem timeout próprio de 60s pro tool loop
                const cronSecret = Deno.env.get("CRON_SECRET") || "";
                const aiInvokeTask = fetch(`${SUPABASE_URL}/functions/v1/whatsapp-ai-respond`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-internal-call": cronSecret,
                  },
                  body: JSON.stringify({
                    tenantId,
                    customerId: customer!.id,
                    phone,
                    customerAttrs: customer!.custom_attributes || null,
                  }),
                }).catch(e => console.error("[webhook] AI invoke error:", e));

                const edgeRuntime = (globalThis as any).EdgeRuntime;
                if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(aiInvokeTask);
                // Não await - fire and forget
              }
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
