/**
 * ai-metrics - API de métricas da IA Ana para dashboard
 *
 * Usa tabela ai_metrics_daily com schema:
 * tenant_id, date, inbound_count, ai_replied_count, human_replied_count,
 * flagged_count, avg_latency_ms, total_tokens_in, total_tokens_out,
 * errors_count, knowledge_hits
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extrair tenant_id do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = profile.tenant_id;
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "7d";

    // Calcular datas
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

    switch (period) {
      case "hoje":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case "ontem":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "30d":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "7d":
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
    }

    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Métricas agregadas do período (ai_metrics_daily)
    const { data: metrics } = await adminClient
      .from("ai_metrics_daily")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .order("date", { ascending: false });

    // Agregar métricas usando nomes de colunas corretos
    const aggregated = {
      total_inbound: 0,
      ai_responses: 0,
      human_responses: 0,
      escalated: 0,
      avg_latency_ms: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      knowledge_hits: 0,
      ai_errors: 0,
    };

    let latencySum = 0;
    let latencyCount = 0;

    for (const m of metrics || []) {
      aggregated.total_inbound += m.inbound_count || 0;
      aggregated.ai_responses += m.ai_replied_count || 0;
      aggregated.human_responses += m.human_replied_count || 0;
      aggregated.escalated += m.flagged_count || 0;
      aggregated.total_input_tokens += Number(m.total_tokens_in) || 0;
      aggregated.total_output_tokens += Number(m.total_tokens_out) || 0;
      aggregated.knowledge_hits += m.knowledge_hits || 0;
      aggregated.ai_errors += m.errors_count || 0;

      if (m.avg_latency_ms > 0) {
        latencySum += m.avg_latency_ms * (m.ai_replied_count || 1);
        latencyCount += m.ai_replied_count || 1;
      }
    }

    aggregated.avg_latency_ms = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;

    // Calcular percentuais
    const totalResponses = aggregated.ai_responses + aggregated.human_responses;
    const aiPercentage = totalResponses > 0 ? Math.round((aggregated.ai_responses / totalResponses) * 100) : 0;

    // Estimar custo (Gemini 2.5 Flash pricing aproximado)
    // Input: $0.15/1M tokens, Output: $0.60/1M tokens
    const estimatedCost = (aggregated.total_input_tokens * 0.00000015) + (aggregated.total_output_tokens * 0.0000006);

    // 2. Knowledge base stats
    const { count: knowledgeCount } = await adminClient
      .from("ai_knowledge")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const { data: topKnowledge } = await adminClient
      .from("ai_knowledge")
      .select("question, answer, hits, category")
      .eq("tenant_id", tenantId)
      .order("hits", { ascending: false })
      .limit(5);

    // 3. Conversas ativas vs resolvidas
    const { data: convStats } = await adminClient
      .from("ai_conversation_status")
      .select("status")
      .eq("tenant_id", tenantId);

    const conversationStats = {
      active: 0,
      resolved: 0,
      escalated: 0,
      extracted: 0,
    };

    for (const c of convStats || []) {
      if (c.status === "active") conversationStats.active++;
      else if (c.status === "resolved") conversationStats.resolved++;
      else if (c.status === "escalated") conversationStats.escalated++;
      else if (c.status === "extracted") conversationStats.extracted++;
    }

    // 4. Métricas por dia (para gráfico)
    const dailyMetrics = (metrics || []).map((m: any) => ({
      date: m.date,
      ai_responses: m.ai_replied_count || 0,
      human_responses: m.human_replied_count || 0,
      avg_latency: m.avg_latency_ms || 0,
      errors: m.errors_count || 0,
    })).reverse();

    // 5. Customers aguardando revisão humana
    const { data: pendingReview } = await adminClient
      .from("customers")
      .select("id, name, phone, custom_attributes")
      .eq("tenant_id", tenantId)
      .not("custom_attributes->needs_human_review", "is", null)
      .order("updated_at", { ascending: false })
      .limit(10);

    const needsReview = (pendingReview || []).filter((c: any) => c.custom_attributes?.needs_human_review === true);

    return new Response(
      JSON.stringify({
        period,
        start_date: startDateStr,
        end_date: endDateStr,
        summary: {
          ai_response_rate: aiPercentage,
          total_ai_responses: aggregated.ai_responses,
          total_human_responses: aggregated.human_responses,
          total_escalated: aggregated.escalated,
          avg_latency_ms: aggregated.avg_latency_ms,
          total_errors: aggregated.ai_errors,
          estimated_cost_usd: parseFloat(estimatedCost.toFixed(4)),
        },
        tokens: {
          input: aggregated.total_input_tokens,
          output: aggregated.total_output_tokens,
        },
        knowledge: {
          total_entries: knowledgeCount || 0,
          total_hits: aggregated.knowledge_hits,
          top_entries: (topKnowledge || []).map((k: any) => ({
            question: k.question,
            answer: k.answer,
            hits: k.hits,
            category: k.category,
          })),
        },
        conversations: conversationStats,
        needs_human_review: needsReview.length,
        pending_review_customers: needsReview.map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          reason: c.custom_attributes?.flag_reason || "N/A",
          flagged_at: c.custom_attributes?.flagged_at,
        })),
        daily: dailyMetrics,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[ai-metrics] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
