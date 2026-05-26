import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Send, CheckCheck, Eye, MousePointerClick,
  DollarSign, Users, TrendingUp, Zap, AlertTriangle,
  ChevronLeft, ChevronRight, Trash2, Play, MessageCircle, Mail,
} from "lucide-react";
import { formatSP, toSaoPaulo } from "@/lib/utils";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { PeriodFilter, DEFAULT_PERIOD, type PeriodRange } from "@/components/campaigns/PeriodFilter";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Inativa", className: "bg-muted text-muted-foreground" },
  running: { label: "Ativa", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700" },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive" },
};

export default function AutomationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(0);
  const [period, setPeriod] = useState<PeriodRange>(DEFAULT_PERIOD);

  // Pending queue count
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["automation-queue-count", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("automation_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id!)
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!id,
  });

  // Clear queue mutation
  const clearQueue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("automation_queue")
        .update({ status: "skipped", processed_at: new Date().toISOString() })
        .eq("campaign_id", id!)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      return data?.length || 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} item(ns) removido(s) da fila`);
      queryClient.invalidateQueries({ queryKey: ["automation-queue-count", id] });
    },
    onError: () => {
      toast.error("Erro ao limpar a fila");
    },
  });

  // Trigger queue processing now
  const triggerNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("automation-trigger-now", {
        body: { campaign_id: id! },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data as { pending_before?: number };
    },
    onSuccess: (data) => {
      const n = data?.pending_before ?? 0;
      toast.success(
        n > 0
          ? `Processamento iniciado para ${n} item(ns) da fila.`
          : "Processamento disparado. Não havia itens pendentes."
      );
      queryClient.invalidateQueries({ queryKey: ["automation-queue-count", id] });
      queryClient.invalidateQueries({ queryKey: ["automation-activities", id] });
      queryClient.invalidateQueries({ queryKey: ["automation-metrics", id] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Erro ao iniciar processamento");
    },
  });

  const { data: campaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ["automation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Metrics query — paginated to avoid 1000 row limit
  const { data: metricsData } = useQuery({
    queryKey: ["automation-metrics", id],
    queryFn: async () => {
      const allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("campaign_activities")
          .select("channel, sent_at, delivered_at, read_at, clicked_at, replied_at, converted_at, conversion_value")
          .eq("campaign_id", id!)
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return allData;
    },
    enabled: !!id,
  });

  // Paginated activities for the log table
  const { data: activitiesResult } = useQuery({
    queryKey: ["automation-activities", id, currentPage, pageSize],
    queryFn: async () => {
      const from = currentPage * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from("campaign_activities")
        .select("*, customers(name, phone, email)", { count: "exact" })
        .eq("campaign_id", id!)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    },
    enabled: !!id,
  });

  const activities = activitiesResult?.rows || [];
  const totalActivities = activitiesResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalActivities / pageSize));

  // Aplica filtro de período sobre o dataset completo.
  // Usa created_at como base de envio + converted_at como base de conversão.
  const allActivitiesFull = metricsData || [];
  const allActivities = period.from && period.to
    ? allActivitiesFull.filter((a: any) => {
        const sentAt = a.sent_at || a.created_at;
        if (!sentAt) return false;
        const d = toSaoPaulo(sentAt);
        return d >= period.from! && d <= period.to!;
      })
    : allActivitiesFull;
  const computeMetrics = (acts: any[]) => ({
    total: acts.length,
    sent: acts.filter((a) => a.sent_at).length,
    delivered: acts.filter((a) => a.delivered_at).length,
    read: acts.filter((a) => a.read_at).length,
    clicked: acts.filter((a) => a.clicked_at).length,
    replied: acts.filter((a) => a.replied_at).length,
    converted: acts.filter((a) => a.converted_at).length,
    revenue: acts.reduce((sum, a) => sum + (Number(a.conversion_value) || 0), 0),
  });
  const metrics = computeMetrics(allActivities);

  // Breakdown por canal (e-mail / whatsapp)
  const channelOf = (a: any): string =>
    a.channel === "whatsapp" ? "whatsapp" : a.channel === "sms" ? "sms" : "email";
  const channelLabel: Record<string, string> = { email: "E-mail", whatsapp: "WhatsApp", sms: "SMS" };
  // Detecta canais do fluxo
  const flowNodes = ((campaign?.flow_data as any)?.nodes || []) as any[];
  const flowChannels = new Set<string>();
  flowNodes.forEach((n) => {
    const t = n.data?.nodeType || n.type;
    if (t === "sendEmail") flowChannels.add("email");
    if (t === "sendWhatsApp") flowChannels.add("whatsapp");
  });
  const channels = [...new Set([...flowChannels, ...allActivities.map(channelOf)])];
  const channelMetrics: Record<string, ReturnType<typeof computeMetrics>> = {};
  channels.forEach((ch) => {
    channelMetrics[ch] = computeMetrics(allActivities.filter((a) => channelOf(a) === ch));
  });

  const deliveryRate = metrics.sent > 0 ? ((metrics.delivered / metrics.sent) * 100).toFixed(1) : "0";
  const readRate = metrics.delivered > 0 ? ((metrics.read / metrics.delivered) * 100).toFixed(1) : "0";
  const clickRate = metrics.delivered > 0 ? ((metrics.clicked / metrics.delivered) * 100).toFixed(1) : "0";
  const conversionRate = metrics.sent > 0 ? ((metrics.converted / metrics.sent) * 100).toFixed(1) : "0";

  const funnelData = [
    { name: "Enviados", value: metrics.sent, fill: "hsl(var(--primary))" },
    { name: "Entregues", value: metrics.delivered, fill: "hsl(210, 70%, 55%)" },
    { name: "Lidos", value: metrics.read, fill: "hsl(180, 60%, 45%)" },
    { name: "Clicados", value: metrics.clicked, fill: "hsl(45, 80%, 50%)" },
    { name: "Convertidos", value: metrics.converted, fill: "hsl(140, 60%, 45%)" },
  ];

  const statusDistribution = [
    { name: "Enviado", value: metrics.sent - metrics.delivered, fill: "hsl(var(--primary))" },
    { name: "Entregue", value: metrics.delivered - metrics.read, fill: "hsl(210, 70%, 55%)" },
    { name: "Lido", value: metrics.read - metrics.clicked, fill: "hsl(180, 60%, 45%)" },
    { name: "Clicado", value: metrics.clicked - metrics.converted, fill: "hsl(45, 80%, 50%)" },
    { name: "Convertido", value: metrics.converted, fill: "hsl(140, 60%, 45%)" },
  ].filter((d) => d.value > 0);

  const chartConfig = { value: { label: "Quantidade" } };

  if (loadingCampaign) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  if (!campaign) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Automação não encontrada.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/automations")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  const statusInfo = statusConfig[campaign.status] || statusConfig.draft;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/automations")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
              <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Criada em {formatSP(campaign.created_at, "dd/MM/yyyy 'às' HH:mm")}
              {period.from && period.to && (
                <span className="ml-2 text-primary">
                  · Métricas: {formatSP(period.from, "dd/MM/yyyy")} até {formatSP(period.to, "dd/MM/yyyy")}
                </span>
              )}
            </p>
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button
            variant="default"
            size="sm"
            onClick={() => triggerNow.mutate()}
            disabled={triggerNow.isPending || campaign.status !== "running"}
            title={campaign.status !== "running" ? "Ative a automação para processar" : "Processa imediatamente os itens pendentes"}
          >
            <Play className="h-4 w-4 mr-2" />
            {triggerNow.isPending ? "Processando..." : `Processar fila${pendingCount ? ` (${pendingCount})` : ""}`}
          </Button>
          {pendingCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar fila ({pendingCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar fila de execução?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso vai descartar {pendingCount} item(ns) pendente(s) na fila desta automação.
                    Apenas novos eventos disparados a partir de agora serão processados.
                    Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearQueue.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Limpar fila
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Error banner */}
        {campaign.status === "failed" && campaign.last_error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Falha na automação</p>
                <p className="text-sm text-muted-foreground mt-1">{campaign.last_error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard icon={Users} label="Total" value={metrics.total} />
          <KpiCard icon={Send} label="Enviados" value={metrics.sent} />
          <KpiCard icon={CheckCheck} label="Entregues" value={metrics.delivered} suffix={`${deliveryRate}%`} />
          <KpiCard icon={Eye} label="Lidos" value={metrics.read} suffix={`${readRate}%`} />
          <KpiCard icon={MousePointerClick} label="Cliques" value={metrics.clicked} suffix={`${clickRate}%`} />
          <KpiCard icon={Send} label="Respostas" value={metrics.replied} />
          <KpiCard icon={TrendingUp} label="Conversões" value={metrics.converted} suffix={`${conversionRate}%`} />
          <KpiCard icon={DollarSign} label="Receita" value={`R$ ${metrics.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} highlight />
        </div>

        {/* Breakdown por canal — separa visualmente WhatsApp e E-mail */}
        {channels.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Detalhes por canal</h2>
              <span className="text-xs text-muted-foreground">{channels.length} {channels.length === 1 ? "canal" : "canais"}</span>
            </div>
            <div className={`grid gap-4 ${channels.length === 1 ? "" : "md:grid-cols-2"}`}>
              {channels.map((ch) => {
                const m = channelMetrics[ch];
                const dr = m.sent > 0 ? ((m.delivered / m.sent) * 100).toFixed(0) : "0";
                const rr = m.delivered > 0 ? ((m.read / m.delivered) * 100).toFixed(0) : "0";
                const cr = m.sent > 0 ? ((m.converted / m.sent) * 100).toFixed(1) : "0";
                const isWa = ch === "whatsapp";
                return (
                  <Card key={ch} className={isWa ? "border-emerald-200/60 bg-emerald-50/30" : "border-blue-200/60 bg-blue-50/30"}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${isWa ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                          {isWa ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                        </span>
                        {channelLabel[ch] || ch}
                        <span className="ml-auto text-xs font-normal text-muted-foreground">
                          {m.total} destinatário{m.total === 1 ? "" : "s"}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                        <ChannelStat label="Enviados" value={m.sent} />
                        <ChannelStat label="Entregues" value={m.delivered} suffix={`${dr}%`} />
                        <ChannelStat label={isWa ? "Lidos" : "Aberturas"} value={m.read} suffix={`${rr}%`} />
                        <ChannelStat label="Cliques" value={m.clicked} />
                        <ChannelStat label="Respostas" value={m.replied} />
                      </div>
                      <div className="flex items-center justify-between border-t pt-3 text-xs">
                        <span className="text-muted-foreground">Conversão {isWa ? "(via WhatsApp)" : "(via E-mail)"}</span>
                        <span className="font-semibold">{m.converted} <span className="text-muted-foreground font-normal">({cr}%)</span></span>
                      </div>
                      {m.revenue > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Receita gerada</span>
                          <span className="font-semibold">R$ {m.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="funnel" className="space-y-4">
          <TabsList>
            <TabsTrigger value="funnel">Funil de Entrega</TabsTrigger>
            <TabsTrigger value="distribution">Distribuição</TabsTrigger>
            <TabsTrigger value="log">Log de Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="funnel">
            <Card>
              <CardHeader><CardTitle className="text-base">Funil de Entrega</CardTitle></CardHeader>
              <CardContent>
                {metrics.sent === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Nenhum envio registrado ainda.</p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart data={funnelData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={80} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {funnelData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="distribution">
            <Card>
              <CardHeader><CardTitle className="text-base">Distribuição de Status</CardTitle></CardHeader>
              <CardContent>
                {statusDistribution.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Nenhum dado disponível.</p>
                ) : (
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <ChartContainer config={chartConfig} className="h-[280px] w-[280px]">
                      <PieChart>
                        <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}>
                          {statusDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ChartContainer>
                    <div className="space-y-2">
                      {statusDistribution.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.fill }} />
                          <span className="text-muted-foreground">{d.name}</span>
                          <span className="font-medium text-foreground">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Log de Atividades ({totalActivities})</CardTitle>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(0); }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {activities.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Nenhuma atividade registrada.</p>
                ) : (
                  <>
                    <div className="overflow-auto max-h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Canal</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Contato</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Enviado</TableHead>
                            <TableHead>Entregue</TableHead>
                            <TableHead>Lido</TableHead>
                            <TableHead>Clicado</TableHead>
                            <TableHead>Conversão</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activities.map((a: any) => {
                            const ch = a.channel === "whatsapp" ? "whatsapp" : a.channel === "sms" ? "sms" : "email";
                            const contact = ch === "whatsapp" || ch === "sms" ? (a.customers?.phone || "—") : (a.customers?.email || "—");
                            const channelBadgeColor =
                              ch === "whatsapp" ? "bg-green-500/15 text-green-700 dark:text-green-300" :
                              ch === "sms" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" :
                              "bg-violet-500/15 text-violet-700 dark:text-violet-300";
                            const channelLabel = ch === "whatsapp" ? "WhatsApp" : ch === "sms" ? "SMS" : "E-mail";
                            const statusColor =
                              a.status === "sent" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
                              a.status === "failed" ? "bg-red-500/15 text-red-700 dark:text-red-300" :
                              a.status === "skipped" ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300" :
                              "bg-muted text-muted-foreground";
                            return (
                            <TableRow key={a.id}>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${channelBadgeColor}`}>
                                  {channelLabel}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">{a.customers?.name || "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{contact}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusColor}`} title={a.error_message || ""}>
                                  {a.status || "—"}
                                </span>
                              </TableCell>
                              <TableCell>{a.sent_at ? <StatusDot color="hsl(var(--primary))" label={formatSP(a.sent_at, "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.delivered_at ? <StatusDot color="hsl(210, 70%, 55%)" label={formatSP(a.delivered_at, "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.read_at ? <StatusDot color="hsl(180, 60%, 45%)" label={formatSP(a.read_at, "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.clicked_at ? <StatusDot color="hsl(45, 80%, 50%)" label={formatSP(new Date(a.clicked_at), "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.converted_at ? <StatusDot color="hsl(140, 60%, 45%)" label={formatSP(new Date(a.converted_at), "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell className="text-right font-medium">
                                {Number(a.conversion_value) > 0
                                  ? `R$ ${Number(a.conversion_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Pagination controls */}
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Página {currentPage + 1} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage + 1 >= totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        Próxima <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function KpiCard({ icon: Icon, label, value, suffix, highlight }: {
  icon: React.ElementType; label: string; value: string | number; suffix?: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-bold text-foreground">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </CardContent>
    </Card>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs">{label}</span>
    </div>
  );
}

function ChannelStat({ label, value, suffix, destructive }: {
  label: string;
  value: string | number;
  suffix?: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={destructive ? "text-base font-bold text-destructive" : "text-base font-bold text-foreground"}>{value}</span>
      {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}
