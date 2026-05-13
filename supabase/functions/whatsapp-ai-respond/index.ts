/**
 * whatsapp-ai-respond - Edge function dedicada para IA Ana
 *
 * Separada do webhook principal para:
 * 1. Ter timeout próprio (60s) - espaço pro tool loop completar
 * 2. Não bloquear o webhook (responde 200 OK rápido pra Meta)
 * 3. Implementar RAG com ai_knowledge
 * 4. Coletar métricas de uso
 */

import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== HELPERS =====

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

async function getPhoneNumberId(tenantId: string): Promise<string> {
  const { data: waAccount } = await supabase
    .from("whatsapp_accounts")
    .select("phone_number_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .single();
  return waAccount?.phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
}

// ===== EMBEDDING (usando Gemini embedding) =====

async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
        }),
      }
    );
    if (!res.ok) {
      console.error("[ai-respond] Embedding error:", res.status);
      return null;
    }
    const data = await res.json();
    return data?.embedding?.values || null;
  } catch (e) {
    console.error("[ai-respond] Embedding error:", e);
    return null;
  }
}

// ===== KNOWLEDGE BASE RAG =====

async function searchKnowledgeBase(
  tenantId: string,
  query: string,
  apiKey: string,
  limit = 3
): Promise<Array<{ question: string; answer: string; similarity: number }>> {
  try {
    const embedding = await generateEmbedding(query, apiKey);
    if (!embedding) return [];

    const { data, error } = await supabase.rpc("search_ai_knowledge", {
      p_tenant_id: tenantId,
      p_embedding: embedding,
      p_limit: limit,
      p_threshold: 0.7,
    });

    if (error) {
      console.error("[ai-respond] Knowledge search error:", error);
      return [];
    }

    // Incrementar hits via função RPC existente
    if (data && data.length > 0) {
      for (const k of data) {
        await supabase.rpc("increment_ai_knowledge_hits", { knowledge_id: k.id }).catch(() => {});
      }
      await incrementMetric(tenantId, "knowledge_hits", data.length);
    } else {
      await incrementMetric(tenantId, "knowledge_misses", 1);
    }

    return data || [];
  } catch (e) {
    console.error("[ai-respond] Knowledge search error:", e);
    return [];
  }
}

// ===== METRICS =====

// Mapear nomes genéricos para colunas reais da tabela ai_metrics_daily
const metricColumnMap: Record<string, string> = {
  ai_responses: "ai_replied_count",
  human_responses: "human_replied_count",
  escalated_to_human: "flagged_count",
  total_inbound_messages: "inbound_count",
  ai_errors: "errors_count",
  knowledge_hits: "knowledge_hits",
  total_input_tokens: "total_tokens_in",
  total_output_tokens: "total_tokens_out",
};

async function incrementMetric(tenantId: string, metric: string, value = 1) {
  try {
    const column = metricColumnMap[metric] || metric;
    const today = new Date().toISOString().slice(0, 10);

    // Upsert: criar registro se não existe
    await supabase
      .from("ai_metrics_daily")
      .upsert(
        { tenant_id: tenantId, date: today, [column]: value },
        { onConflict: "tenant_id,date", ignoreDuplicates: false }
      );

    // Depois incrementar (se já existia)
    const { data: existing } = await supabase
      .from("ai_metrics_daily")
      .select(column)
      .eq("tenant_id", tenantId)
      .eq("date", today)
      .single();

    if (existing) {
      const currentValue = (existing as any)[column] || 0;
      await supabase
        .from("ai_metrics_daily")
        .update({ [column]: currentValue + value })
        .eq("tenant_id", tenantId)
        .eq("date", today);
    }
  } catch (e) {
    // Silently fail - metrics são não-críticas
    console.warn("[ai-respond] Metric increment failed:", e);
  }
}

// ===== MEDIA ANALYSIS (igual ao webhook) =====

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime",
  aac: "audio/aac", m4a: "audio/mp4", mp3: "audio/mpeg", amr: "audio/amr", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
  pdf: "application/pdf",
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

async function analyzeMediaWithGemini(
  tenantId: string,
  storagePath: string,
  mimeTypeHint: string | null,
  msgType: string,
  apiKey: string,
  model: string
): Promise<string | null> {
  try {
    const { data: blob, error } = await supabase.storage.from("whatsapp-media").download(storagePath);
    if (error || !blob) return null;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 18 * 1024 * 1024) return null;

    const ext = (storagePath.split(".").pop() || "").toLowerCase();
    const mimeType = mimeTypeHint || EXT_TO_MIME[ext] || blob.type || "application/octet-stream";

    const promptByType: Record<string, string> = {
      audio: "Transcreva este áudio em português, do começo ao fim. Se não houver fala compreensível, responda apenas '[áudio sem fala compreensível]'.",
      image: "Você é assistente de atendimento. Descreva de forma objetiva e curta o que o cliente enviou nesta imagem e TRANSCREVA qualquer texto visível (número de pedido, código de rastreio, valores, nomes, datas, prints de conversa). Não invente nada. Português.",
      video: "Descreva de forma objetiva e curta o que aparece neste vídeo enviado pelo cliente e transcreva qualquer fala relevante. Não invente nada. Português.",
      document: "Resuma de forma objetiva e curta o conteúdo deste documento enviado pelo cliente, transcrevendo dados relevantes (números, valores, nomes, datas). Não invente nada. Português.",
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptByType[msgType] || promptByType.image }, { inline_data: { mime_type: mimeType, data: bytesToBase64(bytes) } }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join(" ").trim() || null;
  } catch (e) {
    console.error("[ai-respond] Media analysis error:", e);
    return null;
  }
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
      total: o.total, created_at: o.created_at,
      tracking_code: trackingCode,
      tracking_url: trackingCode ? `http://rastreio.maxfem.com.br/${trackingCode}` : null,
      carrier: o.carrier || null, payments: o.payment_summary || [], items: o.items_summary || [],
    };
  });

  return JSON.stringify({ customer_name: customer.name, cpf: cleanCpf, orders_count: formattedOrders.length, orders: formattedOrders });
}

// ===== BLING INTEGRATION =====

async function refreshBlingToken(integrationId: string, cfg: any): Promise<string | null> {
  const clientId = cfg?.client_id || Deno.env.get("BLING_CLIENT_ID");
  const clientSecret = cfg?.client_secret || Deno.env.get("BLING_CLIENT_SECRET");
  if (!clientId || !clientSecret || !cfg?.refresh_token) return null;

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://api.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) return null;

    const now = new Date();
    const newConfig = {
      ...cfg, access_token: data.access_token, refresh_token: data.refresh_token,
      access_expires_at: new Date(now.getTime() + (data.expires_in || 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await supabase.from("integrations").update({ config: newConfig, sync_error: null, updated_at: now.toISOString() }).eq("id", integrationId);
    return data.access_token;
  } catch (e) {
    console.error("[ai-respond] Bling refresh error:", e);
    return null;
  }
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

    if (contacts.length === 0) {
      try {
        const altRes = await fetch(`https://api.bling.com.br/Api/v3/contatos?numeroDocumento=${encodeURIComponent(cleanCpf)}`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (altRes.ok) contacts = (await altRes.json())?.data || [];
      } catch (_) { /* ignore */ }
    }

    if (contacts.length === 0) return JSON.stringify({ error: "Nenhum cliente encontrado no Bling com esse CPF.", cpf: formattedCpf });

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

    if (ordersList.length === 0) return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Cliente encontrado no Bling, mas sem pedidos vinculados." });

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
            }
          }
        } catch (_) { /* ignore */ }
      }

      detailedOrders.push({
        order_number: d.numero, total: d.total, date: d.data,
        tracking_code: trackingCode,
        tracking_url: trackingCode ? `http://rastreio.maxfem.com.br/${trackingCode}` : null,
        carrier,
        payments: (d.parcelas || []).map((p: any) => ({ value: p.valor, due_date: p.dataVencimento, method: p.observacoes || "" })),
        items: (d.itens || []).map((i: any) => ({ name: i.descricao, quantity: i.quantidade, value: i.valor })),
      });
    }

    return JSON.stringify({ source: "bling", customer_name: contactName, cpf: formattedCpf, orders_count: detailedOrders.length, orders: detailedOrders });
  } catch (err) {
    console.error("[ai-respond] Bling lookup error:", err);
    return JSON.stringify({ error: "Erro interno ao consultar o Bling." });
  }
}

// ===== FLAG FOR HUMAN REVIEW =====

async function flagForHumanReview(customerId: string, reason: string): Promise<string> {
  try {
    const { data: cust } = await supabase.from("customers").select("custom_attributes, tenant_id").eq("id", customerId).maybeSingle();
    const attrs = { ...((cust?.custom_attributes as any) || {}) };
    // IA continua respondendo - só marca pra revisão humana
    attrs.needs_human_review = true;
    attrs.flagged_at = new Date().toISOString();
    attrs.flag_reason = String(reason || "").slice(0, 300);
    await supabase.from("customers").update({ custom_attributes: attrs }).eq("id", customerId);

    if (cust?.tenant_id) {
      await incrementMetric(cust.tenant_id, "escalated_to_human", 1);
    }

    console.log(`[ai-respond] Flagged ${customerId} for human REVIEW (IA continues): ${reason}`);
    return JSON.stringify({
      ok: true,
      instruction: "Conversa sinalizada para revisão humana. IMPORTANTE: você CONTINUA atendendo normalmente. Responda ao cliente com acolhimento e tente resolver.",
    });
  } catch (e) {
    console.error("[ai-respond] flagForHumanReview error:", e);
    return JSON.stringify({ ok: false, instruction: "Responda ao cliente normalmente com acolhimento." });
  }
}

// ===== AI TOOLS =====

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
      description: "Sinaliza esta conversa para revisão humana — MAS você (Ana) continua respondendo normalmente. Use quando: reclamação séria, cancelamento/reembolso/troca, problema de pagamento, dúvida técnica/jurídica/médica, ameaça de processo, ou cliente irritado pedindo humano. NÃO pare de atender; apenas sinalize internamente.",
      parameters: { type: "object", properties: { reason: { type: "string", description: "Motivo curto pra revisão humana" } }, required: ["reason"] },
    },
  },
];

// ===== MAIN AI RESPOND FUNCTION =====

interface AIRespondParams {
  tenantId: string;
  customerId: string;
  phone: string;
  customerAttrs: Record<string, any> | null;
}

async function respondWithAI({ tenantId, customerId, phone, customerAttrs }: AIRespondParams) {
  const startTime = Date.now();

  try {
    const attrs = customerAttrs || {};
    if (attrs.ai_enabled === false) {
      console.log(`[ai-respond] AI disabled for customer ${customerId}`);
      return;
    }

    // CPF já conhecido
    let knownCpf = String(attrs.cpf || attrs.document || "").replace(/\D/g, "");
    if (knownCpf.length !== 11) {
      const { data: cust } = await supabase.from("customers").select("document").eq("id", customerId).maybeSingle();
      const d = String(cust?.document || "").replace(/\D/g, "");
      if (d.length === 11) knownCpf = d;
    }
    if (knownCpf.length !== 11) knownCpf = "";

    // Provider de IA
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
    if (!integration) {
      console.log(`[ai-respond] No AI provider for tenant ${tenantId}`);
      return;
    }

    const config = integration.config as any;
    if (config?.ai_enabled === false) return;

    const apiKey = useGemini ? (config?.api_key || Deno.env.get("GEMINI_API_KEY") || "") : (config?.openai_api_key || "");
    if (!apiKey) {
      console.log(`[ai-respond] No API key for ${useGemini ? "Gemini" : "OpenAI"}`);
      return;
    }

    const aiEndpoint = useGemini
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    // Carregar mensagens recentes
    const { data: recentMsgs } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, content, message_type, media_url, metadata, created_at")
      .eq("tenant_id", tenantId).eq("phone", phone)
      .order("created_at", { ascending: false }).limit(20);

    if (!recentMsgs || recentMsgs.length === 0) return;

    // Analisar mídia se necessário
    const mediaTypes = ["image", "video", "audio", "document"];
    const lastUnanalyzed = recentMsgs.find((m: any) =>
      m.direction === "inbound" && m.media_url && mediaTypes.includes(m.message_type) && !m.metadata?.media_analysis);
    if (lastUnanalyzed) {
      const model = String(config.model || "gemini-2.5-flash").replace(/^google\//, "");
      const analysis = await analyzeMediaWithGemini(tenantId, lastUnanalyzed.media_url, lastUnanalyzed.metadata?.mime_type || null, lastUnanalyzed.message_type, apiKey, model);
      if (analysis) {
        const newMeta = { ...(lastUnanalyzed.metadata || {}), media_analysis: analysis };
        await supabase.from("whatsapp_messages").update({ metadata: newMeta }).eq("id", lastUnanalyzed.id);
        lastUnanalyzed.metadata = newMeta;
      }
    }

    // ===== RAG: Buscar conhecimento relevante =====
    const lastInbound = recentMsgs.find((m: any) => m.direction === "inbound");
    const userQuery = lastInbound?.content || "";
    let knowledgeContext = "";

    if (userQuery && useGemini) {
      const knowledge = await searchKnowledgeBase(tenantId, userQuery, apiKey, 3);
      if (knowledge.length > 0) {
        knowledgeContext = "\n\n=== CONHECIMENTO RELEVANTE DA BASE (use como referência) ===\n" +
          knowledge.map((k, i) => `[${i + 1}] Pergunta similar: "${k.question}"\nResposta aprovada: "${k.answer}"`).join("\n\n") +
          "\n=== FIM DO CONHECIMENTO ===\n";
        console.log(`[ai-respond] Found ${knowledge.length} relevant knowledge entries`);
      }
    }

    // Configuração
    const tone = attrs.ai_tone && attrs.ai_tone !== "default" ? attrs.ai_tone : (config.tone || "friendly");
    const model = useGemini ? String(config.model || "gemini-2.5-flash").replace(/^google\//, "") : (config.model || "gpt-4o-mini");
    const systemPrompt = config.whatsapp_prompt || config.system_prompt || "Você é a Ana, atendente da Maxfem. Atende clientes pelo WhatsApp de forma acolhedora e objetiva.";
    const extraContext = attrs.ai_context || "";

    const toneInstructions: Record<string, string> = {
      formal: "Use linguagem formal e profissional.",
      friendly: "Use um tom caloroso e acolhedor.",
      informal: "Use linguagem descontraída e casual.",
      technical: "Seja preciso, objetivo e técnico.",
    };

    // Verificar integrações de pedidos
    const { data: orderIntegrations } = await supabase
      .from("integrations").select("provider")
      .eq("tenant_id", tenantId).in("provider", ["yampi", "bling"]).eq("is_active", true);

    const hasYampi = orderIntegrations?.some((i: any) => i.provider === "yampi");
    const hasBling = orderIntegrations?.some((i: any) => i.provider === "bling");
    const hasOrderTools = hasYampi || hasBling;

    const activeTools: any[] = [];
    if (hasBling) activeTools.push(aiTools[1]);
    else if (hasYampi) activeTools.push(aiTools[0]);
    activeTools.push(aiTools[2]); // flag_for_human_review

    const lookupFn = hasBling ? "lookup_orders_bling" : (hasYampi ? "lookup_orders_by_cpf" : "");
    let orderInstructions = "";
    if (hasOrderTools) {
      orderInstructions = `\nQuando o cliente perguntar sobre pedido / rastreio / entrega / "quando vai chegar", você DEVE consultar com a função ${lookupFn}.
${knownCpf
  ? `O CPF cadastrado deste cliente é ${knownCpf}. Use-o DIRETO em ${lookupFn} — NÃO precisa pedir o CPF.`
  : `Você ainda NÃO tem o CPF deste cliente. Peça primeiro de forma natural.`}

REGRAS sobre rastreio:
- Quando informar rastreio, escreva: "Link para rastreamento: http://rastreio.maxfem.com.br/{tracking_code}"
- NUNCA use Markdown. Sempre URL CRUA.
- Use SEMPRE http://rastreio.maxfem.com.br/{tracking_code}`;
    }

    const guardrails = `

REGRAS CRÍTICAS:
- Você responde DIRETO ao cliente final no WhatsApp. Fale na primeira pessoa, como a Ana da Maxfem.
- INTENÇÃO DE COMPRA = MANDA O LINK NA HORA com UTM (utm_source=whatsapp&utm_medium=atendente-ia&utm_campaign=atendimento).
- NUNCA invente status de pedido, prazos, valores, código de rastreio, políticas, composição de produto.
- Se não consegue resolver, chame flag_for_human_review e diga ao cliente que vai priorizar o caso.
- Quando o cliente enviar imagem/áudio/vídeo/documento, o conteúdo já vem transcrito no histórico.
- Não prometa prazos de resultado de produto nem faça promessas de cura/tratamento.`;

    const fullSystemPrompt = `${systemPrompt}\n\nTom de voz: ${toneInstructions[tone] || toneInstructions.friendly}${extraContext ? `\nContexto adicional: ${extraContext}` : ""}${orderInstructions}${guardrails}${knowledgeContext}\n\nResponda de forma natural, breve e direta. Não use markdown.`;

    // Montar mensagens
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
          c = `[O cliente enviou ${ptMediaName[m.message_type] || "um arquivo"} que não foi possível ler]`;
        } else if (!c) {
          c = `[${m.message_type}]`;
        }
        return { role, content: c };
      }),
    ];

    const openaiBody: any = { model, messages: chatMessages, max_tokens: 500, temperature: 0.7 };
    if (activeTools.length > 0) { openaiBody.tools = activeTools; openaiBody.tool_choice = "auto"; }

    console.log(`[ai-respond] Calling ${useGemini ? "gemini" : "openai"} (${model}) for ${phone}`);

    let openaiResponse = await fetch(aiEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiResponse.ok) {
      console.error(`[ai-respond] AI error ${openaiResponse.status}:`, (await openaiResponse.text()).slice(0, 500));
      await incrementMetric(tenantId, "ai_errors", 1);
      return;
    }

    let result = await openaiResponse.json();
    let assistantMessage = result.choices?.[0]?.message;

    // Tool loop
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

      if (!openaiResponse.ok) {
        console.error(`[ai-respond] Tool-loop error ${openaiResponse.status}`);
        await incrementMetric(tenantId, "ai_errors", 1);
        break;
      }
      result = await openaiResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    const rawReply = assistantMessage?.content?.trim();
    if (!rawReply) return;

    // Sanitização de tracking URLs
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

    // Enviar resposta
    const token = await resolveAccessToken(tenantId);
    const phoneNumberId = await getPhoneNumberId(tenantId);

    const waResponse = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: aiReply } }),
    });

    const waResult = await waResponse.json();
    if (!waResponse.ok) {
      console.error(`[ai-respond] Failed to send reply:`, waResult);
      await incrementMetric(tenantId, "ai_errors", 1);
      return;
    }

    // Salvar mensagem
    await supabase.from("whatsapp_messages").insert({
      tenant_id: tenantId, customer_id: customerId, phone, direction: "outbound",
      message_type: "text", content: aiReply, wamid: waResult.messages?.[0]?.id, status: "sent",
      metadata: {
        ai_generated: true,
        ai_provider: useGemini ? "gemini" : "openai",
        ai_model: model,
        response_time_ms: Date.now() - startTime,
        used_knowledge: knowledgeContext ? true : false,
      },
    });

    // Métricas - usando tabela ai_metrics_daily com schema correto
    const latencyMs = Date.now() - startTime;
    const today = new Date().toISOString().slice(0, 10);
    await incrementMetric(tenantId, "ai_responses", 1);

    // Atualizar latência média
    const { data: todayMetrics } = await supabase
      .from("ai_metrics_daily")
      .select("avg_latency_ms, ai_replied_count")
      .eq("tenant_id", tenantId)
      .eq("date", today)
      .maybeSingle();

    if (todayMetrics) {
      const prevAvg = todayMetrics.avg_latency_ms || 0;
      const prevCount = (todayMetrics.ai_replied_count || 1) - 1;
      const newAvg = Math.round((prevAvg * prevCount + latencyMs) / Math.max(prevCount + 1, 1));
      await supabase
        .from("ai_metrics_daily")
        .update({ avg_latency_ms: newAvg })
        .eq("tenant_id", tenantId)
        .eq("date", today);
    }

    // Tokens (estimativa: 4 chars = 1 token)
    const inputTokens = Math.ceil(chatMessages.reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : 100), 0) / 4);
    const outputTokens = Math.ceil(aiReply.length / 4);
    await incrementMetric(tenantId, "total_input_tokens", inputTokens);
    await incrementMetric(tenantId, "total_output_tokens", outputTokens);

    console.log(`[ai-respond] Sent reply to ${phone} in ${latencyMs}ms`);
  } catch (err) {
    console.error(`[ai-respond] Error:`, err);
    await incrementMetric(tenantId, "ai_errors", 1);
  }
}

// ===== HANDLER =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-call",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Validar chamada interna
    const internalSecret = req.headers.get("x-internal-call");
    const expectedSecret = Deno.env.get("CRON_SECRET") || "";
    if (!internalSecret || !expectedSecret || internalSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { tenantId, customerId, phone, customerAttrs } = await req.json();

    if (!tenantId || !customerId || !phone) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    // Fire-and-forget: inicia o processamento em background
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    const task = respondWithAI({ tenantId, customerId, phone, customerAttrs });

    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(task);
    } else {
      // Fallback: await inline (menos ideal mas funciona)
      await task;
    }

    return new Response(JSON.stringify({ ok: true, message: "AI response queued" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-respond] Handler error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
