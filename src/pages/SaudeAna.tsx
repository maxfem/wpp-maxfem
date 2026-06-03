import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, Bot, Brain, Clock, TrendingUp, MessageSquare, Zap } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Line, LineChart, CartesianGrid } from "recharts";

type Period = "hoje" | "ontem" | "7d" | "30d";

function periodToDateRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  switch (period) {
    case "hoje": return { from: ymd(today), to: ymd(today) };
    case "ontem": { const y = subDays(today, 1); return { from: ymd(y), to: ymd(y) }; }
    case "7d": return { from: ymd(subDays(today, 7)), to: ymd(today) };
    case "30d": return { from: ymd(subDays(today, 30)), to: ymd(today) };
  }
}

export default function SaudeAna() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const [period, setPeriod] = useState<Period>("7d");
  const range = useMemo(() => periodToDateRange(period), [period]);

  // Métricas diárias agregadas
  const { data: dailyMetrics } = useQuery({
    queryKey: ["ai-metrics-daily", tenantId, range],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("ai_metrics_daily")
        .select("*")
        .eq("tenant_id", tenantId)
        .gte("date", range.from)
        .lte("date", range.to)
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  // Eventos recentes (últimas 24h pra latência ao vivo)
  const { data: recentEvents } = useQuery({
    queryKey: ["ai-call-events-recent", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("ai_call_events")
        .select("event, latency_ms, tokens_in, tokens_out, error_message, created_at, metadata")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // Knowledge base size + top hits
  const { data: knowledgeStats } = useQuery({
    queryKey: ["ai-knowledge-stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { count } = await supabase
        .from("ai_knowledge")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      const { data: top } = await supabase
        .from("ai_knowledge")
        .select("question, answer, category, hits, last_used_at")
        .eq("tenant_id", tenantId)
        .order("hits", { ascending: false })
        .limit(10);
      const { data: byCategory } = await supabase
        .from("ai_knowledge")
        .select("category")
        .eq("tenant_id", tenantId);
      const catCounts = (byCategory || []).reduce((acc: Record<string, number>, r: any) => {
        const c = r.category || "outro";
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {});
      return { total: count || 0, top: top || [], byCategory: catCounts };
    },
    enabled: !!tenantId,
    refetchInterval: 120000,
  });

  // Aggregates p/ KPIs
  const kpis = useMemo(() => {
    const m = dailyMetrics || [];
    const sum = (k: keyof (typeof m)[0]) => m.reduce((a, r: any) => a + (Number(r[k]) || 0), 0);
    const inbound = sum("inbound_count");
    const aiReplied = sum("ai_replied_count");
    const flagged = sum("flagged_count");
    const errors = sum("errors_count");
    const tokensIn = sum("total_tokens_in");
    const tokensOut = sum("total_tokens_out");
    const knowledgeHits = sum("knowledge_hits");
    const latencies = m.map((r: any) => r.avg_latency_ms).filter((x): x is number => typeof x === "number" && x > 0);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const aiCoverage = inbound > 0 ? (aiReplied / inbound) * 100 : 0;
    // Gemini 2.5 Flash pricing aprox: $0.075/M input + $0.30/M output (em maio 2026)
    const costUsd = (tokensIn / 1_000_000) * 0.075 + (tokensOut / 1_000_000) * 0.30;
    return { inbound, aiReplied, flagged, errors, tokensIn, tokensOut, knowledgeHits, avgLatency, aiCoverage, costUsd };
  }, [dailyMetrics]);

  // Recent errors
  const recentErrors = useMemo(() => {
    return (recentEvents || []).filter((e: any) => e.event === "error").slice(0, 10);
  }, [recentEvents]);

  const chartData = useMemo(() => {
    return (dailyMetrics || []).map((d: any) => ({
      date: format(new Date(d.date + "T12:00:00"), "dd/MM", { locale: ptBR }),
      Inbound: d.inbound_count,
      IA: d.ai_replied_count,
      Humano: d.human_replied_count,
      Erros: d.errors_count,
    }));
  }, [dailyMetrics]);

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            Saúde da Ana
          </h1>
          <p className="text-muted-foreground mt-1">Observabilidade da IA atendente · atualização em tempo real</p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="hoje">Hoje</TabsTrigger>
            <TabsTrigger value="ontem">Ontem</TabsTrigger>
            <TabsTrigger value="7d">7 dias</TabsTrigger>
            <TabsTrigger value="30d">30 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Mensagens recebidas"
          value={kpis.inbound.toLocaleString("pt-BR")}
          accent
        />
        <KpiCard
          icon={<Bot className="h-5 w-5" />}
          label="Respondidas pela Ana"
          value={`${kpis.aiReplied.toLocaleString("pt-BR")}`}
          sub={`${kpis.aiCoverage.toFixed(1)}% do total`}
        />
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label="Latência média"
          value={kpis.avgLatency > 0 ? `${(kpis.avgLatency / 1000).toFixed(1)}s` : "—"}
          sub="inbound → resposta IA"
        />
        <KpiCard
          icon={<AlertCircle className="h-5 w-5" />}
          label="Sinalizadas humano"
          value={kpis.flagged.toLocaleString("pt-BR")}
          sub="continuou respondendo"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Brain className="h-5 w-5" />} label="Conhecimento aprendido" value={(knowledgeStats?.total || 0).toLocaleString("pt-BR")} sub="cases no banco" />
        <KpiCard icon={<Zap className="h-5 w-5" />} label="Knowledge hits" value={kpis.knowledgeHits.toLocaleString("pt-BR")} sub="RAG aplicado" />
        <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Custo período" value={`US$ ${kpis.costUsd.toFixed(2)}`} sub={`${(kpis.tokensIn + kpis.tokensOut).toLocaleString("pt-BR")} tokens`} />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Erros" value={kpis.errors.toLocaleString("pt-BR")} sub="rate-limit, API, timeout" tone={kpis.errors > 0 ? "warn" : "ok"} />
      </div>

      {/* Gráfico volume */}
      <Card>
        <CardHeader><CardTitle>Volume diário · Inbound vs Resposta</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Inbound" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="IA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Humano" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Conhecimento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top 10 lições mais usadas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(knowledgeStats?.top || []).map((k: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50">
                  <Badge variant="secondary" className="shrink-0">{k.hits}×</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{k.question}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{k.answer}</div>
                    {k.category && <Badge variant="outline" className="mt-1 text-xs">{k.category}</Badge>}
                  </div>
                </div>
              ))}
              {(!knowledgeStats?.top || knowledgeStats.top.length === 0) && (
                <p className="text-sm text-muted-foreground py-8 text-center">A Ana ainda não aprendeu nada. O cron diário começa em breve.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Conhecimento por categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(knowledgeStats?.byCategory || {}).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{cat}</span>
                  <Badge>{count}</Badge>
                </div>
              ))}
              {(!knowledgeStats?.byCategory || Object.keys(knowledgeStats.byCategory).length === 0) && (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem categorias ainda.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Erros recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Erros recentes (últimas 24h)</span>
            <Badge variant={recentErrors.length > 0 ? "destructive" : "secondary"}>{recentErrors.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum erro nas últimas 24h. Ana está saudável.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recentErrors.map((e: any, i: number) => (
                <div key={i} className="text-sm font-mono bg-destructive/5 border border-destructive/20 rounded p-2">
                  <div className="text-xs text-muted-foreground">{format(new Date(e.created_at), "dd/MM HH:mm:ss")}</div>
                  <div className="text-destructive">{e.error_message?.slice(0, 200)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean; tone?: "ok" | "warn" }) {
  return (
    <Card className={accent ? "bg-primary text-primary-foreground" : tone === "warn" ? "border-orange-500/30" : ""}>
      <CardContent className="p-5">
        <div className={`flex items-center gap-2 mb-2 ${accent ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-3xl font-bold leading-tight">{value}</div>
        {sub && <div className={`text-xs mt-1 ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</div>}
      </CardContent>
    </Card>
  );
}
