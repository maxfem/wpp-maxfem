import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, RefreshCw, Activity, Inbox, ShieldCheck, Ban, AlertTriangle, CheckCircle2, Trash2, Plus, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { localeSP, formatSP } from "@/lib/utils";

const EmailMarketing = () => {
  const { currentTenant } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: awsIntegration } = useQuery({
    queryKey: ["email-marketing-aws", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("is_active, config")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "aws")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  const isAwsActive = !!awsIntegration?.is_active;
  const senderEmail = (awsIntegration?.config as any)?.sender_email || "—";

  // Stats from SES API
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["ses-statistics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ses-statistics", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    enabled: isAwsActive,
    refetchInterval: 60_000,
  });

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">E-mail Marketing</h1>
                <p className="text-muted-foreground">Dashboard completo via Amazon SES — métricas, envios, reputação e identidades.</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isAwsActive ? "default" : "destructive"} className="gap-1.5">
                  {isAwsActive ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {isAwsActive ? "SES Ativo" : "SES Inativo"}
                </Badge>
                {stats?.quota?.is_sandbox && (
                  <Badge variant="secondary" className="gap-1.5"><AlertTriangle className="h-3 w-3" /> Sandbox</Badge>
                )}
                {stats?.account?.production_access_enabled && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"><ShieldCheck className="h-3 w-3" /> Produção</Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => { refetchStats(); qc.invalidateQueries(); }}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
                </Button>
              </div>
            </header>

            {!isAwsActive && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="pt-6">
                  <p className="text-sm">Configure e ative a integração AWS SES em <a href="/settings/aws" className="underline font-medium">Configurações → AWS</a> para liberar o dashboard.</p>
                </CardContent>
              </Card>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-5 w-full max-w-3xl">
                <TabsTrigger value="overview"><Activity className="h-4 w-4 mr-2" />Overview</TabsTrigger>
                <TabsTrigger value="logs"><Inbox className="h-4 w-4 mr-2" />Envios</TabsTrigger>
                <TabsTrigger value="identities"><ShieldCheck className="h-4 w-4 mr-2" />Identidades</TabsTrigger>
                <TabsTrigger value="suppression"><Ban className="h-4 w-4 mr-2" />Supressão</TabsTrigger>
                <TabsTrigger value="compose"><Send className="h-4 w-4 mr-2" />Compor</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-6">
                <OverviewTab stats={stats} loading={statsLoading} senderEmail={senderEmail} tenantId={currentTenant?.id} />
              </TabsContent>

              <TabsContent value="logs" className="mt-6">
                <LogsTab tenantId={currentTenant?.id} />
              </TabsContent>

              <TabsContent value="identities" className="mt-6">
                <IdentitiesTab />
              </TabsContent>

              <TabsContent value="suppression" className="mt-6">
                <SuppressionTab />
              </TabsContent>

              <TabsContent value="compose" className="mt-6">
                <ComposeTab isAwsActive={isAwsActive} />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

// ============== OVERVIEW TAB ==============
const OverviewTab = ({ stats, loading, senderEmail, tenantId }: any) => {
  // Aggregates via RPC (substitui fetch de 300k+ events; agrega no Postgres)
  const { data: events } = useQuery({
    queryKey: ["email-events-overview-rpc", tenantId],
    queryFn: async () => {
      if (!tenantId) return { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, complaints: 0, rejects: 0, conversions: 0, revenue: 0 };
      const { data, error } = await supabase.rpc("rpc_email_overview_kpis", { p_tenant: tenantId, p_days: 30 });
      if (error) throw error;
      const d = (data || {}) as any;
      return {
        sent: Number(d.sent || 0),
        delivered: Number(d.delivered || 0),
        opens: Number(d.opens || 0),
        clicks: Number(d.clicks || 0),
        bounces: Number(d.bounces || 0),
        complaints: Number(d.complaints || 0),
        rejects: Number(d.rejects || 0),
        conversions: Number(d.conversions || 0),
        revenue: Number(d.revenue || 0),
      };
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });


  // Aggregate datapoints from SES (last 14 days summed by day)
  const dailyData = React.useMemo(() => {
    if (!stats?.datapoints) return [];
    const byDay = new Map<string, any>();
    for (const dp of stats.datapoints) {
      const d = new Date(dp.timestamp).toISOString().slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, { date: d, sent: 0, bounces: 0, complaints: 0, rejects: 0 });
      const cur = byDay.get(d);
      cur.sent += dp.sent;
      cur.bounces += dp.bounces;
      cur.complaints += dp.complaints;
      cur.rejects += dp.rejects;
    }
    return Array.from(byDay.values()).slice(-14).map(d => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [stats]);

  const totals = React.useMemo(() => {
    const t = { sent: 0, bounces: 0, complaints: 0, rejects: 0 };
    for (const d of dailyData) {
      t.sent += d.sent; t.bounces += d.bounces; t.complaints += d.complaints; t.rejects += d.rejects;
    }
    return t;
  }, [dailyData]);

  const quota = stats?.quota;
  const quotaPct = quota ? (quota.sent_24h / Math.max(quota.max_24h, 1)) * 100 : 0;
  const quotaColor = quotaPct > 90 ? "bg-destructive" : quotaPct > 70 ? "bg-amber-500" : "bg-emerald-500";

  const bounceRate = totals.sent > 0 ? (totals.bounces / totals.sent) * 100 : 0;
  const complaintRate = totals.sent > 0 ? (totals.complaints / totals.sent) * 100 : 0;
  const deliveryRate = totals.sent > 0 ? ((totals.sent - totals.bounces - totals.rejects) / totals.sent) * 100 : 0;
  const openRate = events && events.delivered > 0 ? (events.opens / events.delivered) * 100 : 0;
  const clickRate = events && events.delivered > 0 ? (events.clicks / events.delivered) * 100 : 0;
  const ctor = events && events.opens > 0 ? (events.clicks / events.opens) * 100 : 0;
  const conversionRate = events && events.sent > 0 ? (events.conversions / events.sent) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Send className="h-4 w-4" />} label="Enviados (14d)" value={totals.sent.toLocaleString("pt-BR")} hint="GetSendStatistics" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Taxa de Entrega" value={`${deliveryRate.toFixed(1)}%`} hint={`${(totals.sent - totals.bounces - totals.rejects).toLocaleString("pt-BR")} entregues`} positive={deliveryRate >= 95} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Bounce Rate" value={`${bounceRate.toFixed(2)}%`} hint={`${totals.bounces} bounces`} negative={bounceRate > 5} warn={bounceRate > 2} />
        <KpiCard icon={<Ban className="h-4 w-4" />} label="Complaint Rate" value={`${complaintRate.toFixed(3)}%`} hint={`${totals.complaints} reclamações`} negative={complaintRate > 0.1} />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Open Rate (30d)" value={events ? `${openRate.toFixed(1)}%` : "—"} hint={events ? `${events.opens} aberturas` : "Aguardando SNS"} />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Click Rate (30d)" value={events ? `${clickRate.toFixed(1)}%` : "—"} hint={events ? `${events.clicks} cliques` : "Aguardando SNS"} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Conversões (30d)" value={events ? `${events.conversions}` : "—"} hint={events ? `R$ ${events.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Vendas atribuídas"} positive={events && events.conversions > 0} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Rejects (14d)" value={totals.rejects.toLocaleString("pt-BR")} hint="Rejeitados pelo SES" negative={totals.rejects > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Envios e Bounces (últimos 14 dias)</CardTitle>
            <CardDescription>Dados agregados do SES via GetSendStatistics</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-64 animate-pulse bg-muted rounded" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#sentGrad)" name="Enviados" />
                  <Area type="monotone" dataKey="bounces" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.3} name="Bounces" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cota de Envio</CardTitle>
            <CardDescription>Limites diários da conta SES</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {quota ? (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">Últimas 24h</span>
                    <span className="font-mono font-semibold">{quota.sent_24h?.toLocaleString("pt-BR")} / {quota.max_24h?.toLocaleString("pt-BR")}</span>
                  </div>
                  <Progress value={quotaPct} className={quotaColor} />
                  <p className="text-xs text-muted-foreground mt-1">{quotaPct.toFixed(1)}% utilizado</p>
                </div>
                <div className="pt-4 border-t space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa máx/seg</span><span className="font-mono">{quota.max_per_second}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Região</span><span className="font-mono">{stats?.region || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Modo</span>
                    <Badge variant={quota.is_sandbox ? "secondary" : "default"}>{quota.is_sandbox ? "Sandbox" : "Produção"}</Badge>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Remetente</span><span className="font-mono text-xs truncate max-w-[140px]">{senderEmail}</span></div>
                </div>
              </>
            ) : <div className="text-sm text-muted-foreground">Carregando...</div>}
          </CardContent>
        </Card>
      </div>

      {/* Reputation health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reputação — Bounce Rate</CardTitle>
            <CardDescription>AWS suspende conta acima de 10%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{bounceRate.toFixed(2)}%</div>
            <Progress value={Math.min(bounceRate * 10, 100)} className={bounceRate > 5 ? "bg-destructive" : bounceRate > 2 ? "bg-amber-500" : "bg-emerald-500"} />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>0%</span><span className="text-amber-500">5% alerta</span><span className="text-destructive">10% suspensão</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reputação — Complaint Rate</CardTitle>
            <CardDescription>AWS suspende conta acima de 0.5%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{complaintRate.toFixed(3)}%</div>
            <Progress value={Math.min(complaintRate * 200, 100)} className={complaintRate > 0.1 ? "bg-destructive" : "bg-emerald-500"} />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>0%</span><span className="text-amber-500">0.1% alerta</span><span className="text-destructive">0.5% suspensão</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {(!events || events.opens === 0) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium mb-1">📡 Open / Click rates aparecem em "—"?</p>
            <p className="text-muted-foreground">Para capturar aberturas e cliques, você precisa configurar um <strong>Configuration Set</strong> no SES com destino SNS apontando para o webhook:</p>
            <code className="block mt-2 p-2 bg-muted rounded text-xs break-all">{`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ses-events-webhook`}</code>
            <p className="text-xs text-muted-foreground mt-2">Ative os eventos: Send, Delivery, Open, Click, Bounce, Complaint, Reject. Depois envie e-mails passando <code>configurationSet</code> no payload.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const KpiCard = ({ icon, label, value, hint, positive, negative, warn }: any) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between mb-2 text-muted-foreground">
        <span className="text-xs uppercase tracking-wide">{label}</span>
        <span className={positive ? "text-emerald-500" : negative ? "text-destructive" : warn ? "text-amber-500" : ""}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold font-mono ${negative ? "text-destructive" : warn ? "text-amber-500" : ""}`}>{value}</div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </CardContent>
  </Card>
);

// ============== LOGS TAB ==============
const LogsTab = ({ tenantId }: { tenantId?: string }) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["email-logs", tenantId, statusFilter, page, pageSize],
    queryFn: async () => {
      if (!tenantId) return { rows: [], count: 0 };
      
      let q = supabase
        .from("email_logs")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = data || [];

      // Buscar conversões de campaign_activities em paralelo
      const pairs = rows
        .filter((r: any) => r.campaign_id && r.customer_id)
        .map((r: any) => ({ c: r.campaign_id, u: r.customer_id }));

      if (pairs.length === 0) return { rows: rows.map((r: any) => ({ ...r, activity: null })), count: count || 0 };

      const campaignIds = Array.from(new Set(pairs.map(p => p.c)));
      const customerIds = Array.from(new Set(pairs.map(p => p.u)));

      const { data: acts } = await supabase
        .from("campaign_activities")
        .select("campaign_id, customer_id, converted_at, conversion_value")
        .in("campaign_id", campaignIds)
        .in("customer_id", customerIds);

      const actMap = new Map<string, any>();
      (acts || []).forEach((a: any) => {
        actMap.set(`${a.campaign_id}:${a.customer_id}`, a);
      });

      return {
        rows: rows.map((r: any) => ({
          ...r,
          activity: r.campaign_id && r.customer_id ? actMap.get(`${r.campaign_id}:${r.customer_id}`) || null : null,
        })),
        count: count || 0
      };
    },
    enabled: !!tenantId,
  });

  const logs = data?.rows || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);


  const statusBadge = (s: string) => {
    const map: any = {
      sent: { v: "default", label: "Enviado" },
      delivered: { v: "default", label: "Entregue", cls: "bg-emerald-600 hover:bg-emerald-700" },
      bounced: { v: "destructive", label: "Bounce" },
      complained: { v: "destructive", label: "Reclamação" },
      rejected: { v: "destructive", label: "Rejeitado" },
      pending: { v: "secondary", label: "Pendente" },
      failed: { v: "destructive", label: "Falhou" },
    };
    const cfg = map[s] || { v: "outline", label: s };
    return <Badge variant={cfg.v} className={cfg.cls}>{cfg.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Histórico de Envios</CardTitle>
            <CardDescription>Todos os e-mails enviados via SES com status atual</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map(v => (
                  <SelectItem key={v} value={v.toString()}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {["all", "sent", "delivered", "bounced", "complained", "rejected"].map(s => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => { setStatusFilter(s); setPage(0); }}>
                {s === "all" ? "Todos" : s}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="h-32 animate-pulse bg-muted rounded" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aberturas</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead>MessageId</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs && logs.length > 0 ? logs.map((l: any) => {
                const activity = Array.isArray(l.activity) ? l.activity[0] : l.activity;
                const converted = activity?.converted_at;
                const value = activity?.conversion_value;
                
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">{l.created_at ? localeSP(l.created_at) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{l.to_email}</TableCell>
                    <TableCell className="max-w-xs truncate">{l.subject}</TableCell>
                    <TableCell>{statusBadge(l.status)}</TableCell>
                    <TableCell className="text-right font-mono">{l.opens || 0}</TableCell>
                    <TableCell className="text-right font-mono">{l.clicks || 0}</TableCell>
                    <TableCell className="text-right">
                      {converted ? (
                        <div className="flex flex-col items-end">
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Convertido</Badge>
                          {value > 0 && <span className="text-[10px] text-muted-foreground">R$ {value.toLocaleString("pt-BR")}</span>}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">{l.aws_message_id}</TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum envio encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {totalPages > 1 && (
        <CardFooter className="flex items-center justify-between border-t py-4">
          <div className="text-sm text-muted-foreground">
            Mostrando {page * pageSize + 1} a {Math.min((page + 1) * pageSize, totalCount)} de {totalCount} envios
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium">
              Página {page + 1} de {totalPages}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

// ============== IDENTITIES TAB ==============
const IdentitiesTab = () => {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ses-identities"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ses-identities", { body: { action: "list" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ses-identities", {
        body: { action: newEmail.includes("@") ? "verify_email" : "verify_domain", [newEmail.includes("@") ? "email" : "domain"]: newEmail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Verificação solicitada. Confira o e-mail / configure o DNS.");
      setNewEmail("");
      qc.invalidateQueries({ queryKey: ["ses-identities"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (identity: string) => {
      const { data, error } = await supabase.functions.invoke("ses-identities", { body: { action: "delete", identity } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast.success("Identidade removida."); qc.invalidateQueries({ queryKey: ["ses-identities"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <CardTitle>Identidades Verificadas</CardTitle>
            <CardDescription>E-mails e domínios autorizados a enviar via SES + status DKIM</CardDescription>
          </div>
          <div className="flex gap-2">
            <Input placeholder="email@dominio.com ou dominio.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-64" />
            <Button onClick={() => addMut.mutate()} disabled={!newEmail || addMut.isPending}>
              <Plus className="h-4 w-4 mr-2" /> Verificar
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="h-32 animate-pulse bg-muted rounded" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identidade</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Verificação</TableHead>
                <TableHead>DKIM</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.identities?.length ? data.identities.map((id: any) => (
                <TableRow key={id.identity}>
                  <TableCell className="font-mono text-xs">{id.identity}</TableCell>
                  <TableCell><Badge variant="outline">{id.type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={id.verification_status === "Success" ? "default" : id.verification_status === "Pending" ? "secondary" : "destructive"}
                      className={id.verification_status === "Success" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                      {id.verification_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={id.dkim_status === "Success" ? "default" : "secondary"}
                      className={id.dkim_status === "Success" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                      {id.dkim_enabled ? id.dkim_status : "Desativado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remover ${id.identity}?`)) deleteMut.mutate(id.identity); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma identidade verificada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

// ============== SUPPRESSION TAB ==============
const SuppressionTab = () => {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState<"BOUNCE" | "COMPLAINT">("BOUNCE");

  const { data, isLoading } = useQuery({
    queryKey: ["ses-suppression"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ses-suppression", { body: { action: "list" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ses-suppression", { body: { action: "add", email: newEmail, reason } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast.success("Adicionado à lista de supressão."); setNewEmail(""); qc.invalidateQueries({ queryKey: ["ses-suppression"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke("ses-suppression", { body: { action: "remove", email } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast.success("Removido da supressão."); qc.invalidateQueries({ queryKey: ["ses-suppression"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <CardTitle>Lista de Supressão</CardTitle>
            <CardDescription>E-mails bloqueados na conta SES — total: {data?.total ?? 0}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Input placeholder="email@exemplo.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-56" />
            <select value={reason} onChange={e => setReason(e.target.value as any)} className="border border-input bg-background rounded-md px-3 text-sm">
              <option value="BOUNCE">Bounce</option>
              <option value="COMPLAINT">Complaint</option>
            </select>
            <Button onClick={() => addMut.mutate()} disabled={!newEmail || addMut.isPending}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="h-32 animate-pulse bg-muted rounded" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Suprimido em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.suppressed?.length ? data.suppressed.map((s: any) => (
                <TableRow key={s.email}>
                  <TableCell className="font-mono text-xs">{s.email}</TableCell>
                  <TableCell><Badge variant={s.reason === "COMPLAINT" ? "destructive" : "secondary"}>{s.reason}</Badge></TableCell>
                  <TableCell className="text-xs">{s.last_update_time ? localeSP(s.last_update_time) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => removeMut.mutate(s.email)}>Remover</Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Lista de supressão vazia.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

// ============== COMPOSE TAB ==============
const ComposeTab = ({ isAwsActive }: { isAwsActive: boolean }) => {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [configSet, setConfigSet] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !subject || !html) { toast.error("Preencha todos os campos."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: { to, subject, html, configurationSet: configSet || undefined },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast.success(`E-mail enviado! MessageId: ${data.messageId}`);
      setTo(""); setSubject(""); setHtml("");
    } catch (err: any) {
      toast.error(`Falha: ${err.message}`);
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compor Novo E-mail</CardTitle>
        <CardDescription>Envio direto via SES. Use Configuration Set para rastrear aberturas/cliques.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSend} className="space-y-4 max-w-2xl">
          <div className="space-y-2"><Label>Destinatário</Label><Input value={to} onChange={e => setTo(e.target.value)} placeholder="email@exemplo.com" required /></div>
          <div className="space-y-2"><Label>Assunto</Label><Input value={subject} onChange={e => setSubject(e.target.value)} required /></div>
          <div className="space-y-2"><Label>Configuration Set (opcional)</Label><Input value={configSet} onChange={e => setConfigSet(e.target.value)} placeholder="ex: maxfem-tracking" /></div>
          <div className="space-y-2"><Label>HTML</Label><Textarea value={html} onChange={e => setHtml(e.target.value)} className="min-h-[200px] font-mono text-sm" required /></div>
          <Button type="submit" disabled={loading || !isAwsActive} className="w-full">
            {loading ? "Enviando..." : <><Send className="h-4 w-4 mr-2" /> Enviar agora</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default EmailMarketing;
