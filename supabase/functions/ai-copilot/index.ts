import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== Local lookup: query orders from local DB by CPF =====
async function lookupOrdersByCpf(tenantId: string, cpf: string, adminClient: any): Promise<string> {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) {
    return JSON.stringify({ error: "CPF inválido. Informe os 11 dígitos." });
  }

  const { data: customer } = await adminClient
    .from("customers")
    .select("id, name, document, phone")
    .eq("tenant_id", tenantId)
    .eq("document", cleanCpf)
    .maybeSingle();

  if (!customer) {
    return JSON.stringify({ error: "Nenhum cliente encontrado com esse CPF.", cpf: cleanCpf });
  }

  const { data: orders } = await adminClient
    .from("orders")
    .select("id, external_id, order_number, total, status, mapped_status, status_alias, tracking_code, tracking_url, carrier, delivery_estimate, payment_summary, items_summary, created_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!orders || orders.length === 0) {
    return JSON.stringify({
      customer_name: customer.name,
      cpf: cleanCpf,
      orders: [],
      message: "Cliente encontrado, mas sem pedidos registrados.",
    });
  }

  const statusLabels: Record<string, string> = {
    pending: "Aguardando pagamento",
    waiting_payment: "Aguardando pagamento",
    paid: "Pago",
    invoiced: "Faturado",
    shipped: "Enviado",
    on_carriage: "Em transporte",
    in_transit: "Em transporte",
    delivered: "Entregue",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  };

  const formattedOrders = orders.map((o: any) => {
    const trackingCode = o.tracking_code || null;
    const trackingUrl = trackingCode
      ? `https://rastreio.maxfem.com.br/${trackingCode}`
      : (o.tracking_url || null);

    return {
      order_number: o.order_number || o.external_id?.replace("yampi_", "") || o.id,
      status: statusLabels[o.status_alias || o.status] || o.status,
      status_alias: o.status_alias || o.status,
      total: o.total,
      created_at: o.created_at,
      tracking_code: trackingCode,
      tracking_url: trackingUrl,
      carrier: o.carrier || null,
      payments: o.payment_summary || [],
      items: o.items_summary || [],
    };
  });

  console.log("[copilot] Local orders lookup result:", JSON.stringify(formattedOrders));

  return JSON.stringify({
    customer_name: customer.name,
    cpf: cleanCpf,
    orders_count: formattedOrders.length,
    orders: formattedOrders,
    note: "Dados sincronizados da plataforma. Se o rastreio não aparece, pode estar pendente de atualização na origem.",
  });
}

// ===== Auto-refresh Bling token if expired =====
async function refreshBlingToken(integrationId: string, cfg: any, adminClient: any): Promise<string | null> {
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
    if (!res.ok) { console.error("[copilot] Bling refresh failed:", data); return null; }

    const now = new Date();
    const newConfig = {
      ...cfg,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_expires_at: new Date(now.getTime() + (data.expires_in || 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await adminClient.from("integrations").update({ config: newConfig, sync_error: null, updated_at: now.toISOString() }).eq("id", integrationId);
    console.log("[copilot] Bling token refreshed successfully");
    return data.access_token;
  } catch (e) { console.error("[copilot] Bling refresh error:", e); return null; }
}

// ===== Bling V3 API lookup: query orders in real-time by CPF =====
async function lookupOrdersBling(tenantId: string, cpf: string, adminClient: any): Promise<string> {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) {
    return JSON.stringify({ error: "CPF inválido. Informe os 11 dígitos." });
  }

  try {
    const { data: blingIntegration } = await adminClient
      .from("integrations")
      .select("id, config")
      .eq("tenant_id", tenantId)
      .eq("provider", "bling")
      .eq("is_active", true)
      .maybeSingle();

    if (!blingIntegration) {
      return JSON.stringify({ error: "Integração Bling não configurada." });
    }

    const cfg = blingIntegration.config as any;
    let accessToken = cfg?.access_token;
    if (!accessToken) {
      return JSON.stringify({ error: "Token do Bling expirado ou inválido." });
    }

    const expiresAt = cfg.access_expires_at ? new Date(cfg.access_expires_at).getTime() : 0;
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      console.log("[copilot] Bling token expired, refreshing...");
      const newToken = await refreshBlingToken(blingIntegration.id, cfg, adminClient);
      if (newToken) accessToken = newToken;
    }

    const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    let contactRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (contactRes.status === 401) {
      console.log("[copilot] Bling 401, attempting token refresh...");
      const newToken = await refreshBlingToken(blingIntegration.id, cfg, adminClient);
      if (newToken) {
        accessToken = newToken;
        contactRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
      }
    }

    if (!contactRes.ok) {
      console.error("[copilot] Bling contact search error:", contactRes.status);
      return JSON.stringify({ error: "Erro ao consultar Bling. Tente novamente." });
    }

    const contactData = await contactRes.json();
    const contacts = contactData?.data || [];

    if (contacts.length === 0) {
      return JSON.stringify({ error: "Nenhum cliente encontrado no Bling com esse CPF.", cpf: formattedCpf });
    }

    const contactId = contacts[0].id;
    const contactName = contacts[0].nome;

    const ordersRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas?idContato=${contactId}&limit=5`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!ordersRes.ok) {
      console.error("[copilot] Bling orders search error:", ordersRes.status);
      return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Erro ao buscar pedidos no Bling." });
    }

    const ordersData = await ordersRes.json();
    const ordersList = ordersData?.data || [];

    if (ordersList.length === 0) {
      return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Cliente encontrado no Bling, mas sem pedidos." });
    }

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
            const nfeData = await nfeRes.json();
            const nfe = nfeData?.data;
            const nfeVolumes = nfe?.transporte?.volumes || [];
            trackingCode = nfeVolumes[0]?.codigoRastreamento || trackingCode;
            if (!carrier) carrier = nfe?.transporte?.transportador?.nome || null;
          }
        } catch (e) {
          console.warn("[copilot] NFe tracking fetch error:", e);
        }
      }

      if (!trackingCode) {
        try {
          const logRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${order.id}/logistica`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          });
          if (logRes.ok) {
            const logData = await logRes.json();
            const logItems = logData?.data || [];
            if (logItems.length > 0) {
              trackingCode = logItems[0]?.codigoRastreamento || logItems[0]?.rastreamento?.codigo || trackingCode;
              trackingUrl = logItems[0]?.linkRastreamento || logItems[0]?.rastreamento?.link || null;
            }
          }
        } catch (e) {
          console.warn("[copilot] Logistics tracking fetch error:", e);
        }
      }

      if (trackingCode) {
        trackingUrl = `https://rastreio.maxfem.com.br/${trackingCode}`;
      }

      const payments = (d.parcelas || []).map((p: any) => ({
        value: p.valor,
        due_date: p.dataVencimento,
        method: p.observacoes || "",
      }));

      const items = (d.itens || []).map((i: any) => ({
        name: i.descricao,
        quantity: i.quantidade,
        value: i.valor,
      }));

      detailedOrders.push({
        order_number: d.numero,
        total: d.total,
        date: d.data,
        tracking_code: trackingCode,
        tracking_url: trackingUrl,
        carrier,
        payments,
        items,
      });
    }

    console.log("[copilot] Bling orders lookup result:", JSON.stringify(detailedOrders));

    return JSON.stringify({
      source: "bling",
      customer_name: contactName,
      cpf: formattedCpf,
      orders_count: detailedOrders.length,
      orders: detailedOrders,
    });
  } catch (err) {
    console.error("[copilot] Bling lookup error:", err);
    return JSON.stringify({ error: "Erro interno ao consultar o Bling." });
  }
}

const tools = [
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_by_cpf",
      description:
        "Consulta pedidos de um cliente pelo CPF nos dados sincronizados do sistema local. Use quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento ou compras.",
      parameters: {
        type: "object",
        properties: {
          cpf: {
            type: "string",
            description: "CPF do cliente (apenas números ou com pontuação)",
          },
        },
        required: ["cpf"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_bling",
      description:
        "Consulta pedidos e código de rastreio em tempo real na API do Bling pelo CPF do cliente. Use esta função quando lookup_orders_by_cpf não retornar rastreio ou quando quiser dados mais atualizados do ERP.",
      parameters: {
        type: "object",
        properties: {
          cpf: {
            type: "string",
            description: "CPF do cliente (apenas números ou com pontuação)",
          },
        },
        required: ["cpf"],
      },
    },
  },
];

// ===== Download media from Supabase storage and convert to base64 =====
async function downloadMediaAsBase64(mediaUrl: string, adminClient: any): Promise<{ data: string; mimeType: string } | null> {
  try {
    // If it's a Supabase storage URL, use the client
    if (mediaUrl.includes("/storage/v1/object/")) {
      const pathMatch = mediaUrl.match(/\/storage\/v1\/object\/(?:sign|public)\/([^?]+)/);
      if (pathMatch) {
        const fullPath = decodeURIComponent(pathMatch[1]);
        const bucketEnd = fullPath.indexOf("/");
        const bucket = fullPath.substring(0, bucketEnd);
        const path = fullPath.substring(bucketEnd + 1);

        const { data, error } = await adminClient.storage.from(bucket).download(path);
        if (error || !data) {
          console.warn("[copilot] Storage download error:", error);
          return null;
        }

        const arrayBuffer = await data.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        const mimeType = data.type || "application/octet-stream";
        return { data: base64, mimeType };
      }
    }

    // For signed URLs or external URLs, fetch directly
    const res = await fetch(mediaUrl);
    if (!res.ok) {
      console.warn("[copilot] Media fetch error:", res.status);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    const mimeType = res.headers.get("content-type") || "application/octet-stream";
    return { data: base64, mimeType };
  } catch (e) {
    console.error("[copilot] Media download error:", e);
    return null;
  }
}

// ===== Build multimodal message content for Gemini =====
async function buildGeminiMessageContent(m: any, adminClient: any): Promise<any[]> {
  const content: any[] = [];

  if (m.media_url && m.message_type === "image") {
    // Try to get signed URL or use directly
    const mediaData = await downloadMediaAsBase64(m.media_url, adminClient);
    if (mediaData) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${mediaData.mimeType};base64,${mediaData.data}` },
      });
    } else {
      // Fallback: send URL directly
      content.push({ type: "image_url", image_url: { url: m.media_url, detail: "low" } });
    }
    if (m.content) content.push({ type: "text", text: m.content });
    return content;
  }

  if (m.media_url && (m.message_type === "audio" || m.message_type === "ptt")) {
    const mediaData = await downloadMediaAsBase64(m.media_url, adminClient);
    if (mediaData) {
      const audioFormat = mediaData.mimeType.includes("ogg") ? "ogg" :
                          mediaData.mimeType.includes("mp4") ? "mp4" :
                          mediaData.mimeType.includes("mpeg") || mediaData.mimeType.includes("mp3") ? "mp3" : "wav";
      content.push({
        type: "input_audio",
        input_audio: { data: mediaData.data, format: audioFormat },
      });
      content.push({ type: "text", text: "Transcreva e interprete este áudio do cliente. Responda com base no conteúdo do áudio." });
    } else {
      content.push({ type: "text", text: `[Áudio enviado pelo cliente — não foi possível processar]${m.content ? `\n${m.content}` : ""}` });
    }
    return content;
  }

  if (m.media_url && m.message_type === "video") {
    const mediaData = await downloadMediaAsBase64(m.media_url, adminClient);
    if (mediaData) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${mediaData.mimeType};base64,${mediaData.data}` },
      });
      content.push({ type: "text", text: "Analise este vídeo enviado pelo cliente e descreva o conteúdo relevante para o atendimento." });
    } else {
      content.push({ type: "text", text: `[Vídeo enviado pelo cliente — URL: ${m.media_url}]${m.content ? `\n${m.content}` : ""}` });
    }
    return content;
  }

  if (m.media_url && m.message_type === "document") {
    content.push({ type: "text", text: `[Documento enviado — URL: ${m.media_url}]${m.content ? `\n${m.content}` : ""}` });
    return content;
  }

  content.push({ type: "text", text: m.content || `[${m.message_type}]` });
  return content;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, messages, conversation_context, tone_override } = await req.json();

    if (!tenant_id || !messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing tenant_id or messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ===== Determine AI provider: Gemini (priority) > OpenAI =====
    const { data: geminiIntegration } = await adminClient
      .from("integrations")
      .select("config")
      .eq("tenant_id", tenant_id)
      .eq("provider", "gemini")
      .eq("is_active", true)
      .maybeSingle();

    const { data: openaiIntegration } = await adminClient
      .from("integrations")
      .select("config")
      .eq("tenant_id", tenant_id)
      .eq("provider", "openai")
      .eq("is_active", true)
      .maybeSingle();

    const useGemini = !!geminiIntegration;
    const integration = geminiIntegration || openaiIntegration;

    if (!integration) {
      return new Response(JSON.stringify({ error: "Nenhum provedor de IA configurado. Vá em Configurações > Integrações e ative Gemini ou OpenAI." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = integration.config as any;

    // For OpenAI, require API key
    if (!useGemini) {
      const apiKey = config.openai_api_key;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "API Key da OpenAI não configurada." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check which integrations exist for order lookup tools
    const { data: orderIntegrations } = await adminClient
      .from("integrations")
      .select("provider")
      .eq("tenant_id", tenant_id)
      .in("provider", ["yampi", "bling"])
      .eq("is_active", true);

    const hasYampi = orderIntegrations?.some((i: any) => i.provider === "yampi");
    const hasBling = orderIntegrations?.some((i: any) => i.provider === "bling");
    const hasOrderTools = hasYampi || hasBling;

    const activeTools: any[] = [];
    if (hasYampi) activeTools.push(tools[0]);
    if (hasBling) activeTools.push(tools[1]);

    const tone = tone_override || config.tone || "friendly";
    const model = useGemini
      ? (config.model || "google/gemini-2.5-flash")
      : (config.model || "gpt-4o-mini");
    const systemPrompt = config.system_prompt || "Você é um assistente de atendimento ao cliente.";

    const toneInstructions: Record<string, string> = {
      formal: "Use linguagem formal e profissional.",
      friendly: "Use um tom caloroso e acolhedor.",
      informal: "Use linguagem descontraída e casual.",
      technical: "Seja preciso, objetivo e técnico.",
    };

    let orderInstructions = "";
    if (hasOrderTools) {
      const toolNames = [];
      if (hasYampi) toolNames.push("lookup_orders_by_cpf (consulta no banco local)");
      if (hasBling) toolNames.push("lookup_orders_bling (consulta em tempo real no ERP Bling)");

      orderInstructions = `\n\nVocê tem acesso às seguintes funções para consultar pedidos: ${toolNames.join(", ")}.
Quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento ou compras, solicite o CPF.
${hasBling ? "SEMPRE use lookup_orders_bling PRIMEIRO para consultar rastreio — ele busca dados em tempo real direto do ERP Bling. Nunca use lookup_orders_by_cpf para rastreio se o Bling estiver disponível." : ""}
${hasYampi && !hasBling ? "Use lookup_orders_by_cpf para consultar dados sincronizados localmente." : ""}

REGRAS IMPORTANTES para resposta sobre pedidos:
- Se o campo tracking_code existir nos dados retornados, SEMPRE informe o código de rastreio e o link de rastreio (tracking_url) de forma clara e direta.
- Se houver dados de pagamento (payments), informe o método e status do pagamento.
- Formate a resposta com: número do pedido, status, código de rastreio (se houver), link de rastreio (se houver), transportadora, e valor.
- SOMENTE diga "código de rastreio ainda não disponível" quando tracking_code for null ou vazio.
- Nunca invente informações. Use apenas os dados retornados pela função.
- IMPORTANTE: NÃO use formatação Markdown para links. Escreva a URL diretamente no texto, sem colchetes, parênteses ou formatação especial. NUNCA coloque parênteses ao redor de URLs. Exemplo correto: "Acompanhe pelo link: https://rastreio.maxfem.com.br/ABC123". Exemplos ERRADOS: "[clique aqui](url)", "(https://url)", "* [Acompanhar pedido](url)".
- O link de rastreio é SEMPRE no formato https://rastreio.maxfem.com.br/CODIGO_RASTREIO — use exatamente o tracking_url retornado pela função, sem modificar, sem adicionar parênteses, colchetes ou qualquer caractere ao redor.
- CRÍTICO: NUNCA modifique o código de rastreamento. Copie-o EXATAMENTE como veio nos dados, incluindo underscores, hífens e outros caracteres especiais. Exemplo: se o código é "BLI_16023873836", escreva "BLI_16023873836" e NÃO "BLI16023873836".`;
    }

    const mediaInstructions = useGemini
      ? `\nQuando o cliente enviar uma imagem, analise o conteúdo visual detalhadamente e use para contextualizar sua resposta.
Quando o cliente enviar um vídeo, analise o conteúdo do vídeo e descreva o que é relevante para o atendimento.
Quando o cliente enviar um áudio, transcreva o conteúdo do áudio e responda com base no que foi dito.`
      : `\nQuando o cliente enviar uma imagem, analise o conteúdo da imagem e use-o para contextualizar sua resposta.
Quando o cliente enviar vídeo ou áudio, reconheça que recebeu a mídia e peça mais detalhes se necessário.`;

    const fullSystemPrompt = `${systemPrompt}

Tom de voz: ${toneInstructions[tone] || toneInstructions.friendly}
${conversation_context ? `\nContexto adicional desta conversa: ${conversation_context}` : ""}
${orderInstructions}
${mediaInstructions}

Baseado no histórico de mensagens abaixo, sugira uma resposta para o atendente enviar ao cliente. Responda apenas com o texto da sugestão, sem explicações adicionais.`;

    // ===== Build messages array =====
    const chatMessages: any[] = [{ role: "system", content: fullSystemPrompt }];

    // For Gemini with multimodal, process media properly
    if (useGemini) {
      for (const m of messages.slice(-20)) {
        const role = m.direction === "inbound" ? "user" : "assistant";
        const hasMedia = m.media_url && ["image", "video", "audio", "ptt"].includes(m.message_type);

        if (hasMedia) {
          const contentParts = await buildGeminiMessageContent(m, adminClient);
          chatMessages.push({ role, content: contentParts });
        } else if (m.media_url && m.message_type === "document") {
          chatMessages.push({
            role,
            content: `[Documento enviado — URL: ${m.media_url}]${m.content ? `\n${m.content}` : ""}`,
          });
        } else {
          chatMessages.push({ role, content: m.content || `[${m.message_type}]` });
        }
      }
    } else {
      // OpenAI: existing logic
      for (const m of messages.slice(-20)) {
        const role = m.direction === "inbound" ? "user" : "assistant";

        if (m.media_url && m.message_type === "image") {
          const content: any[] = [
            { type: "image_url", image_url: { url: m.media_url, detail: "low" } },
          ];
          if (m.content) content.push({ type: "text", text: m.content });
          chatMessages.push({ role, content });
        } else if (m.media_url && m.message_type === "video") {
          chatMessages.push({
            role,
            content: `[Vídeo enviado pelo cliente — URL: ${m.media_url}]${m.content ? `\n${m.content}` : ""}`,
          });
        } else if (m.media_url && (m.message_type === "audio" || m.message_type === "ptt")) {
          chatMessages.push({
            role,
            content: `[Áudio enviado pelo cliente — URL: ${m.media_url}]${m.content ? `\n${m.content}` : ""}`,
          });
        } else if (m.media_url && m.message_type === "document") {
          chatMessages.push({
            role,
            content: `[Documento enviado — URL: ${m.media_url}]${m.content ? `\n${m.content}` : ""}`,
          });
        } else {
          chatMessages.push({ role, content: m.content || `[${m.message_type}]` });
        }
      }
    }

    // ===== Call AI provider =====
    const aiEndpoint = useGemini
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const aiApiKey = useGemini
      ? Deno.env.get("LOVABLE_API_KEY")!
      : config.openai_api_key;

    const requestBody: any = {
      model,
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
    };

    if (hasOrderTools) {
      requestBody.tools = activeTools;
      requestBody.tool_choice = "auto";
    }

    console.log(`[copilot] Using provider: ${useGemini ? "gemini" : "openai"}, model: ${model}`);

    let aiResponse = await fetch(aiEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errText);
      if (aiResponse.status === 401) {
        return new Response(JSON.stringify({ error: useGemini ? "Erro de autenticação com Lovable AI." : "API Key da OpenAI inválida." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro ao chamar a IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result = await aiResponse.json();
    let assistantMessage = result.choices?.[0]?.message;

    // ===== Tool call loop =====
    let iterations = 0;
    while (assistantMessage?.tool_calls?.length > 0 && iterations < 5) {
      iterations++;
      chatMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult = "";

        if (toolCall.function.name === "lookup_orders_by_cpf") {
          console.log(`[copilot] Tool call: lookup_orders_by_cpf(${args.cpf})`);
          toolResult = await lookupOrdersByCpf(tenant_id, args.cpf, adminClient);
        } else if (toolCall.function.name === "lookup_orders_bling") {
          console.log(`[copilot] Tool call: lookup_orders_bling(${args.cpf})`);
          toolResult = await lookupOrdersBling(tenant_id, args.cpf, adminClient);
        }

        chatMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      aiResponse = await fetch(aiEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          max_tokens: 800,
          temperature: 0.7,
        }),
      });

      if (!aiResponse.ok) {
        console.error("AI tool follow-up error:", aiResponse.status);
        break;
      }

      result = await aiResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    // Sanitize: convert Markdown links to plain URLs and strip wrapping parens
    const rawSuggestion = assistantMessage?.content || "";
    let suggestion = rawSuggestion
      .replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_: string, _text: string, url: string) => url)
      .replace(/\((https?:\/\/[^\s)]+)\)/g, (_: string, url: string) => url)
      .replace(/[*\-]\s*(https?:\/\/)/g, (_: string, proto: string) => proto)
      .replace(/(https?:\/\/[^\s]+)/g, (url: string) => url.replace(/[)}\].,;:!?*]+$/, ""))
      .replace(/[\[(](https?:\/\/[^\s\])]+)[\])]/g, (_: string, url: string) => url);

    return new Response(JSON.stringify({ suggestion, provider: useGemini ? "gemini" : "openai" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
