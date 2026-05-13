// ai-learn-from-conversations — Cron diário que aprende com conversas reais.
//
// Estratégia: pega conversas das últimas 24h que tiveram resposta HUMANA (não-IA) seguindo
// uma pergunta do cliente. Cada par (pergunta_cliente, resposta_humana) vira um chunk no
// ai_knowledge — porque a resposta humana é "fonte de verdade" sobre como o time atende.
//
// Como funciona:
// 1. Lista todos tenants ativos
// 2. Pra cada tenant:
//    a. Busca whatsapp_messages últimas 24h
//    b. Encontra pares: inbound_text → outbound_humano (sem ai_generated:true)
//    c. Cluster por phone + janela de 30 min
//    d. Pra cada par, gera um Q&A condensado via Gemini
//    e. Gera embedding e salva em ai_knowledge
// 3. Roda agregação diária em ai_metrics_daily

import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Msg {
  id: string;
  customer_id: string | null;
  phone: string;
  direction: string;
  content: string;
  message_type: string;
  metadata: any;
  created_at: string;
}

async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text: text.slice(0, 2000) }] } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.embedding?.values || null;
  } catch { return null; }
}

async function condenseToQA(messages: Msg[], apiKey: string): Promise<{ question: string; answer: string; category: string } | null> {
  const conversation = messages.map(m => `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${m.content}`).join("\n");
  const prompt = `Você é um especialista em extrair conhecimento de conversas de atendimento da Maxfem (saúde íntima feminina).

Abaixo está um trecho de conversa entre cliente e atendente humano. Extraia o aprendizado em formato JSON:
{
  "question": "pergunta canônica do cliente, generalizada (sem nomes/dados pessoais)",
  "answer": "resposta canônica do atendente, generalizada e replicável (sem nomes/dados pessoais, sem links específicos de pedido)",
  "category": "uma de: pedido, rastreio, produto, troca_devolucao, pagamento, uso, efeitos, reclamacao, outro"
}

REGRAS:
- Anonimize CPF, nome, número de pedido, valor específico.
- Resposta canônica = como o atendente DEVERIA responder qualquer cliente nessa situação (não copie literalmente).
- Se a conversa não tem aprendizado útil/canônico (ex: "ok", "obrigada", "tá"), retorne {"skip": true}.
- Se a resposta humana foi vaga/ruim, retorne {"skip": true}.

Conversa:
${conversation}

Responda APENAS o JSON, sem markdown.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text).filter(Boolean).join("").trim();
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed.skip || !parsed.question || !parsed.answer) return null;
    return { question: String(parsed.question), answer: String(parsed.answer), category: String(parsed.category || "outro") };
  } catch (e) {
    console.error("[learn] condense error:", e);
    return null;
  }
}

async function learnForTenant(tenantId: string): Promise<{ extracted: number; skipped: number }> {
  const { data: geminiInt } = await supabase
    .from("integrations").select("config")
    .eq("tenant_id", tenantId).eq("provider", "gemini").eq("is_active", true).maybeSingle();
  const apiKey = (geminiInt?.config as any)?.api_key;
  if (!apiKey) { console.log(`[learn] No Gemini key for tenant ${tenantId}`); return { extracted: 0, skipped: 0 }; }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: msgs } = await supabase
    .from("whatsapp_messages")
    .select("id, customer_id, phone, direction, content, message_type, metadata, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (!msgs || msgs.length === 0) return { extracted: 0, skipped: 0 };

  // Cluster por phone
  const byPhone = new Map<string, Msg[]>();
  for (const m of msgs as Msg[]) {
    if (!byPhone.has(m.phone)) byPhone.set(m.phone, []);
    byPhone.get(m.phone)!.push(m);
  }

  let extracted = 0;
  let skipped = 0;

  for (const [phone, conv] of byPhone) {
    // Encontra pares: bloco de inbounds → primeira outbound HUMANA (sem ai_generated)
    for (let i = 0; i < conv.length; i++) {
      const m = conv[i];
      if (m.direction !== "outbound" || m.metadata?.ai_generated === true) continue;
      // Acha bloco de inbounds imediatamente antes
      const inbounds: Msg[] = [];
      for (let j = i - 1; j >= 0; j--) {
        if (conv[j].direction === "inbound" && conv[j].message_type === "text" && conv[j].content?.trim()) {
          inbounds.unshift(conv[j]);
        } else if (conv[j].direction === "outbound") {
          break;
        }
      }
      if (inbounds.length === 0) continue;
      // Janela de 30min entre primeira inbound e a resposta humana
      const delta = new Date(m.created_at).getTime() - new Date(inbounds[0].created_at).getTime();
      if (delta > 30 * 60 * 1000) continue;

      // Resposta humana muito curta provavelmente não é útil
      if ((m.content || "").trim().length < 15) { skipped++; continue; }

      // Verifica se já temos essa mensagem como fonte (evita reprocessar)
      const { data: existing } = await supabase
        .from("ai_knowledge")
        .select("id").eq("source_message_id", m.id).maybeSingle();
      if (existing) { skipped++; continue; }

      const qa = await condenseToQA([...inbounds, m], apiKey);
      if (!qa) { skipped++; continue; }

      const emb = await embedText(qa.question, apiKey);
      if (!emb) { skipped++; continue; }

      await supabase.from("ai_knowledge").insert({
        tenant_id: tenantId,
        question: qa.question,
        answer: qa.answer,
        category: qa.category,
        source: "human_resolved",
        source_message_id: m.id,
        embedding: emb,
        confidence: 0.85,
      });
      extracted++;
    }
  }

  return { extracted, skipped };
}

async function aggregateDailyMetrics(tenantId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: events } = await supabase
    .from("ai_call_events")
    .select("event, latency_ms, tokens_in, tokens_out")
    .eq("tenant_id", tenantId)
    .gte("created_at", yesterday);

  const counters = { inbound: 0, ai_replied: 0, flagged: 0, errors: 0, knowledge_hits: 0, latencies: [] as number[], tokens_in: 0, tokens_out: 0 };
  for (const ev of events || []) {
    if (ev.event === "reply_sent") {
      counters.ai_replied++;
      if (ev.latency_ms) counters.latencies.push(ev.latency_ms);
      counters.tokens_in += ev.tokens_in || 0;
      counters.tokens_out += ev.tokens_out || 0;
    }
    if (ev.event === "error") counters.errors++;
    if (ev.event === "flag_for_human") counters.flagged++;
    if (ev.event === "knowledge_hit") counters.knowledge_hits++;
  }
  // Conta inbound separado da tabela messages
  const { count: inboundCount } = await supabase
    .from("whatsapp_messages").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).eq("direction", "inbound").gte("created_at", yesterday);
  const { count: humanOutCount } = await supabase
    .from("whatsapp_messages").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).eq("direction", "outbound").gte("created_at", yesterday)
    .not("metadata->ai_generated", "eq", true);

  const avgLatency = counters.latencies.length > 0
    ? Math.round(counters.latencies.reduce((a, b) => a + b, 0) / counters.latencies.length)
    : null;

  await supabase.from("ai_metrics_daily").upsert({
    tenant_id: tenantId,
    date: today,
    inbound_count: inboundCount || 0,
    ai_replied_count: counters.ai_replied,
    human_replied_count: humanOutCount || 0,
    flagged_count: counters.flagged,
    avg_latency_ms: avgLatency,
    total_tokens_in: counters.tokens_in,
    total_tokens_out: counters.tokens_out,
    errors_count: counters.errors,
    knowledge_hits: counters.knowledge_hits,
  }, { onConflict: "tenant_id,date" });
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { data: tenants } = await supabase.from("tenants").select("id").limit(100);
    const results: any[] = [];
    for (const t of tenants || []) {
      try {
        const r = await learnForTenant(t.id);
        await aggregateDailyMetrics(t.id);
        results.push({ tenant_id: t.id, ...r });
      } catch (e: any) {
        results.push({ tenant_id: t.id, error: String(e?.message || e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
