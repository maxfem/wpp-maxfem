/**
 * ai-knowledge-extract - Cron diário para extração de conhecimento
 *
 * Roda 1x/dia (ex: 04:00 BRT) e:
 * 1. Busca conversas resolvidas não extraídas
 * 2. Extrai Q&A pairs via Gemini
 * 3. Gera embeddings e salva no ai_knowledge
 * 4. Marca conversa como extracted
 *
 * Config cron no Supabase Dashboard: 0 7 * * * (07:00 UTC = 04:00 BRT)
 */

import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== EMBEDDING =====

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
          taskType: "RETRIEVAL_DOCUMENT",
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.embedding?.values || null;
  } catch (e) {
    console.error("[knowledge-extract] Embedding error:", e);
    return null;
  }
}

// ===== Q&A EXTRACTION =====

interface QAPair {
  question: string;
  answer: string;
  tags: string[];
}

async function extractQAPairs(
  messages: Array<{ direction: string; content: string }>,
  apiKey: string,
  model: string
): Promise<QAPair[]> {
  try {
    const conversationText = messages
      .map((m) => `${m.direction === "inbound" ? "CLIENTE" : "ATENDENTE"}: ${m.content}`)
      .join("\n");

    const prompt = `Analise esta conversa de atendimento ao cliente e extraia pares de PERGUNTA e RESPOSTA que possam ser reutilizados em atendimentos futuros.

REGRAS:
1. Extraia APENAS perguntas reais do cliente (não invente)
2. A resposta deve ser a que o atendente DEU (não a ideal)
3. Generalize quando possível (ex: "Qual o prazo de entrega?" em vez de "Quanto tempo demora pra chegar no RJ?")
4. Ignore perguntas muito específicas de um pedido único
5. Priorize: dúvidas sobre produtos, políticas, rastreio, pagamento, uso
6. Adicione tags relevantes (max 3): produto, entrega, pagamento, rastreio, devolucao, uso, politica, etc
7. Se não houver Q&A reutilizável, retorne array vazio

CONVERSA:
${conversationText}

Responda APENAS com JSON válido no formato:
[
  {"question": "...", "answer": "...", "tags": ["tag1", "tag2"]},
  ...
]`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });

    if (!res.ok) {
      console.error("[knowledge-extract] Gemini error:", res.status);
      return [];
    }

    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text)
      .filter(Boolean)
      .join("")
      .trim();

    // Extrair JSON do texto (pode vir com markdown)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const pairs = JSON.parse(jsonMatch[0]);
    return Array.isArray(pairs) ? pairs : [];
  } catch (e) {
    console.error("[knowledge-extract] Q&A extraction error:", e);
    return [];
  }
}

// ===== MARK RESOLVED CONVERSATIONS =====

async function markResolvedConversations(tenantId: string) {
  // Conversas são consideradas "resolvidas" se:
  // 1. Última mensagem foi há mais de 24h
  // 2. OU cliente não respondeu após a última mensagem do atendente/IA há mais de 6h
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // Buscar clientes com conversas ativas
  const { data: activeConvs } = await supabase
    .from("ai_conversation_status")
    .select("id, customer_id, phone, last_message_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (!activeConvs || activeConvs.length === 0) return;

  for (const conv of activeConvs) {
    // Verificar última mensagem
    const { data: lastMsg } = await supabase
      .from("whatsapp_messages")
      .select("direction, created_at")
      .eq("tenant_id", tenantId)
      .eq("phone", conv.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastMsg) continue;

    const lastMsgTime = new Date(lastMsg.created_at).toISOString();
    const shouldResolve =
      lastMsgTime < cutoff24h || // Última msg há mais de 24h
      (lastMsg.direction === "outbound" && lastMsgTime < cutoff6h); // Atendente respondeu há mais de 6h sem retorno

    if (shouldResolve) {
      await supabase
        .from("ai_conversation_status")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conv.id);
      console.log(`[knowledge-extract] Marked conversation ${conv.id} as resolved`);
    }
  }
}

// ===== PROCESS TENANT =====

async function processTenant(tenantId: string) {
  console.log(`[knowledge-extract] Processing tenant ${tenantId}`);

  // Marcar conversas resolvidas primeiro
  await markResolvedConversations(tenantId);

  // Buscar config do Gemini
  const { data: geminiIntegration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("provider", "gemini")
    .eq("is_active", true)
    .maybeSingle();

  if (!geminiIntegration) {
    console.log(`[knowledge-extract] No Gemini integration for tenant ${tenantId}`);
    return;
  }

  const config = geminiIntegration.config as any;
  const apiKey = config?.api_key;
  if (!apiKey) {
    console.log(`[knowledge-extract] No Gemini API key for tenant ${tenantId}`);
    return;
  }

  const model = String(config.model || "gemini-2.5-flash").replace(/^google\//, "");

  // Buscar conversas resolvidas não extraídas
  const { data: conversations } = await supabase
    .from("ai_conversation_status")
    .select("id, customer_id, phone, message_count")
    .eq("tenant_id", tenantId)
    .eq("status", "resolved")
    .is("extracted_at", null)
    .gte("message_count", 3) // Pelo menos 3 mensagens
    .limit(20); // Processar em batches

  if (!conversations || conversations.length === 0) {
    console.log(`[knowledge-extract] No conversations to extract for tenant ${tenantId}`);
    return;
  }

  console.log(`[knowledge-extract] Found ${conversations.length} conversations to extract`);

  let extractedCount = 0;
  let knowledgeCount = 0;

  for (const conv of conversations) {
    try {
      // Buscar mensagens da conversa
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("direction, content, message_type, metadata, created_at")
        .eq("tenant_id", tenantId)
        .eq("phone", conv.phone)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Últimos 7 dias
        .order("created_at", { ascending: true })
        .limit(50);

      if (!messages || messages.length < 3) {
        await supabase
          .from("ai_conversation_status")
          .update({ extracted_at: new Date().toISOString(), status: "extracted" })
          .eq("id", conv.id);
        continue;
      }

      // Montar conteúdo das mensagens (incluindo análise de mídia)
      const msgContents = messages.map((m: any) => {
        let content = m.content || "";
        if (m.metadata?.media_analysis) {
          content = content ? `${content} [Mídia: ${m.metadata.media_analysis}]` : `[Mídia: ${m.metadata.media_analysis}]`;
        }
        return { direction: m.direction, content };
      }).filter((m: any) => m.content);

      if (msgContents.length < 3) {
        await supabase
          .from("ai_conversation_status")
          .update({ extracted_at: new Date().toISOString(), status: "extracted" })
          .eq("id", conv.id);
        continue;
      }

      // Extrair Q&A pairs
      const qaPairs = await extractQAPairs(msgContents, apiKey, model);

      if (qaPairs.length > 0) {
        console.log(`[knowledge-extract] Extracted ${qaPairs.length} Q&A pairs from conversation ${conv.id}`);

        for (const qa of qaPairs) {
          // Verificar se já existe pergunta similar
          const embedding = await generateEmbedding(qa.question, apiKey);
          if (!embedding) continue;

          // Buscar duplicatas
          const { data: existing } = await supabase.rpc("search_ai_knowledge", {
            p_tenant_id: tenantId,
            p_embedding: embedding,
            p_limit: 1,
            p_threshold: 0.92, // Alta similaridade = duplicata
          });

          if (existing && existing.length > 0) {
            console.log(`[knowledge-extract] Skipping duplicate: "${qa.question.slice(0, 50)}..."`);
            continue;
          }

          // Inserir conhecimento (usando schema existente da tabela ai_knowledge)
          await supabase.from("ai_knowledge").insert({
            tenant_id: tenantId,
            question: qa.question.slice(0, 500),
            answer: qa.answer.slice(0, 2000),
            embedding,
            source: "conversation",
            source_message_id: conv.id,
            category: (qa.tags || [])[0] || "geral", // Primeira tag como categoria
            confidence: 0.8, // AI-extracted
          });

          knowledgeCount++;
        }
      }

      // Marcar como extraída
      await supabase
        .from("ai_conversation_status")
        .update({ extracted_at: new Date().toISOString(), status: "extracted" })
        .eq("id", conv.id);

      extractedCount++;

      // Rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`[knowledge-extract] Error processing conversation ${conv.id}:`, e);
    }
  }

  console.log(`[knowledge-extract] Tenant ${tenantId}: extracted ${extractedCount} conversations, ${knowledgeCount} knowledge entries`);
}

// ===== TRACK CONVERSATIONS =====

// Função auxiliar para criar/atualizar tracking de conversas (chamada pelo webhook)
export async function trackConversation(tenantId: string, customerId: string, phone: string, direction: string, isAiGenerated: boolean) {
  try {
    // Upsert conversation status
    const { data: existing } = await supabase
      .from("ai_conversation_status")
      .select("id, message_count, ai_message_count, human_message_count")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (existing) {
      const updates: any = {
        last_message_at: new Date().toISOString(),
        message_count: (existing.message_count || 0) + 1,
        updated_at: new Date().toISOString(),
      };

      if (direction === "outbound") {
        if (isAiGenerated) {
          updates.ai_message_count = (existing.ai_message_count || 0) + 1;
        } else {
          updates.human_message_count = (existing.human_message_count || 0) + 1;
        }
      }

      // Se recebeu nova mensagem do cliente, reativar conversa se estava resolvida
      if (direction === "inbound" && existing.status === "resolved") {
        updates.status = "active";
        updates.resolved_at = null;
      }

      await supabase.from("ai_conversation_status").update(updates).eq("id", existing.id);
    } else {
      await supabase.from("ai_conversation_status").insert({
        tenant_id: tenantId,
        customer_id: customerId,
        phone,
        status: "active",
        message_count: 1,
        ai_message_count: direction === "outbound" && isAiGenerated ? 1 : 0,
        human_message_count: direction === "outbound" && !isAiGenerated ? 1 : 0,
      });
    }
  } catch (e) {
    console.error("[knowledge-extract] trackConversation error:", e);
  }
}

// ===== HANDLER =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // Validar cron secret
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET") || "";

  // Aceita chamada via cron (sem auth header) ou com Bearer token
  const isValidAuth =
    authHeader?.replace("Bearer ", "") === cronSecret ||
    req.headers.get("x-internal-call") === cronSecret;

  if (!isValidAuth && cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    console.log("[knowledge-extract] Starting extraction job...");

    // Buscar todos os tenants com Gemini ativo
    const { data: tenants } = await supabase
      .from("integrations")
      .select("tenant_id")
      .eq("provider", "gemini")
      .eq("is_active", true);

    if (!tenants || tenants.length === 0) {
      console.log("[knowledge-extract] No tenants with Gemini integration");
      return new Response(JSON.stringify({ ok: true, message: "No tenants to process" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const uniqueTenants = [...new Set(tenants.map((t) => t.tenant_id))];
    console.log(`[knowledge-extract] Processing ${uniqueTenants.length} tenants`);

    for (const tenantId of uniqueTenants) {
      await processTenant(tenantId);
    }

    console.log("[knowledge-extract] Extraction job completed");

    return new Response(JSON.stringify({ ok: true, message: `Processed ${uniqueTenants.length} tenants` }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[knowledge-extract] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
