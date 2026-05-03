import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  ArrowLeft, Send, CheckCheck, Eye, MousePointerClick,
  DollarSign, Clock, Users, TrendingUp,
} from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { formatSP } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendado", className: "bg-yellow-100 text-yellow-700" },
  sending: { label: "Enviando", className: "bg-blue-100 text-blue-700" },
  sent: { label: "Enviado", className: "bg-green-100 text-green-700" },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive" },
  finished: { label: "Encerrada", className: "bg-muted text-muted-foreground" },
};

const activityStatusConfig: Record<string, { label: string; className: string }> = {
  sent: { label: "Enviado", className: "bg-primary/10 text-primary" },
  delivered: { label: "Entregue", className: "bg-primary/10 text-primary" },
  read: { label: "Aberto", className: "bg-accent text-accent-foreground" },
  clicked: { label: "Clicado", className: "bg-secondary text-secondary-foreground" },
  converted: { label: "Convertido", className: "bg-primary/10 text-primary" },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive" },
  bounced: { label: "Bounce", className: "bg-destructive/10 text-destructive" },
  complained: { label: "Reclamação", className: "bg-destructive/10 text-destructive" },
};

const getActivityStatus = (activity: any) => {
  if (activity.error_message || ["failed", "bounced", "complained", "rejected"].includes(activity.status)) {
    return activityStatusConfig[activity.status] || activityStatusConfig.failed;
  }
  if (activity.converted_at) return activityStatusConfig.converted;
  if (activity.clicked_at) return activityStatusConfig.clicked;
  if (activity.read_at) return activityStatusConfig.read;
  if (activity.delivered_at) return activityStatusConfig.delivered;
  return activityStatusConfig.sent;
};

export default function CampaignDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant } = useAuth();

  const { data: campaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ["campaign", id],
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

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ["campaign-activities", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("*, customers(name, phone, email)")
        .eq("campaign_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const metrics = {
    total: activities.length,
    sent: activities.filter((a) => a.sent_at).length,
    delivered: activities.filter((a) => a.delivered_at).length,
    read: activities.filter((a) => a.read_at).length,
    clicked: activities.filter((a) => a.clicked_at).length,
    failed: activities.filter((a) => a.error_message || ["failed", "bounced", "complained", "rejected"].includes(a.status)).length,
    replied: activities.filter((a) => a.replied_at).length,
    converted: activities.filter((a) => a.converted_at).length,
    revenue: activities.reduce((sum, a) => sum + (Number(a.conversion_value) || 0), 0),
  };

  const deliveryRate = metrics.sent > 0 ? ((metrics.delivered / metrics.sent) * 100).toFixed(1) : "0";
  const readRate = metrics.delivered > 0 ? ((metrics.read / metrics.delivered) * 100).toFixed(1) : "0";
  const clickRate = metrics.delivered > 0 ? ((metrics.clicked / metrics.delivered) * 100).toFixed(1) : "0";
  const conversionRate = metrics.sent > 0 ? ((metrics.converted / metrics.sent) * 100).toFixed(1) : "0";

  const funnelData = [
    { name: "Enviados", value: metrics.sent, fill: "hsl(var(--primary))" },
    { name: "Entregues", value: metrics.delivered, fill: "hsl(210, 70%, 55%)" },
    { name: "Lidos", value: metrics.read, fill: "hsl(180, 60%, 45%)" },
    { name: "Clicados", value: metrics.clicked, fill: "hsl(45, 80%, 50%)" },
    { name: "Falhas", value: metrics.failed, fill: "hsl(var(--destructive))" },
    { name: "Convertidos", value: metrics.converted, fill: "hsl(140, 60%, 45%)" },
  ];

  const statusDistribution = [
    { name: "Enviado", value: metrics.sent - metrics.delivered, fill: "hsl(var(--primary))" },
    { name: "Entregue", value: metrics.delivered - metrics.read, fill: "hsl(210, 70%, 55%)" },
    { name: "Lido", value: metrics.read - metrics.clicked, fill: "hsl(180, 60%, 45%)" },
    { name: "Clicado", value: metrics.clicked - metrics.converted, fill: "hsl(45, 80%, 50%)" },
    { name: "Falhou", value: metrics.failed, fill: "hsl(var(--destructive))" },
    { name: "Convertido", value: metrics.converted, fill: "hsl(140, 60%, 45%)" },
  ].filter((d) => d.value > 0);

  const chartConfig = {
    value: { label: "Quantidade" },
  };

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
          <p className="text-muted-foreground">Campanha não encontrada.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/campaigns")}>
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
              <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Criada em {formatSP(new Date(campaign.created_at), "dd/MM/yyyy 'às' HH:mm")}
              {campaign.scheduled_at && (
                <> · Agendada para {formatSP(new Date(campaign.scheduled_at), "dd/MM/yyyy 'às' HH:mm")}</>
              )}
            </p>
          </div>
        </div>

          {/* Error banner */}
          {campaign.status === "failed" && (campaign as any).last_error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Falha no envio</p>
                  <p className="text-sm text-muted-foreground mt-1">{(campaign as any).last_error}</p>
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
          <KpiCard icon={AlertTriangle} label="Falhas" value={metrics.failed} destructive />
          <KpiCard icon={TrendingUp} label="Conversões" value={metrics.converted} suffix={`${conversionRate}%`} />
          <KpiCard icon={DollarSign} label="Receita" value={`R$ ${metrics.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} highlight />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="funnel" className="space-y-4">
          <TabsList>
            <TabsTrigger value="funnel">Funil de Entrega</TabsTrigger>
            <TabsTrigger value="distribution">Distribuição</TabsTrigger>
            <TabsTrigger value="log">Log de Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="funnel">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funil de Entrega</CardTitle>
              </CardHeader>
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
              <CardHeader>
                <CardTitle className="text-base">Distribuição de Status</CardTitle>
              </CardHeader>
              <CardContent>
                {statusDistribution.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Nenhum dado disponível.</p>
                ) : (
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <ChartContainer config={chartConfig} className="h-[280px] w-[280px]">
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
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
                <CardTitle className="text-base">Log de Atividades ({activities.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {activities.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Nenhuma atividade registrada.</p>
                ) : (
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Destino</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Enviado</TableHead>
                          <TableHead>Entregue</TableHead>
                          <TableHead>Lido</TableHead>
                          <TableHead>Clicado</TableHead>
                          <TableHead>Erro</TableHead>
                          <TableHead>Conversão</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activities.map((a: any) => {
                          const activityStatus = getActivityStatus(a);
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="font-medium">{a.customers?.name || "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{a.customers?.email || a.customers?.phone || "—"}</TableCell>
                              <TableCell><Badge className={activityStatus.className}>{activityStatus.label}</Badge></TableCell>
                              <TableCell>{a.sent_at ? <StatusDot color="hsl(var(--primary))" label={formatSP(new Date(a.sent_at), "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.delivered_at ? <StatusDot color="hsl(210, 70%, 55%)" label={formatSP(new Date(a.delivered_at), "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.read_at ? <StatusDot color="hsl(180, 60%, 45%)" label={formatSP(new Date(a.read_at), "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell>{a.clicked_at ? <StatusDot color="hsl(45, 80%, 50%)" label={formatSP(new Date(a.clicked_at), "dd/MM HH:mm")} /> : "—"}</TableCell>
                              <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground" title={a.error_message || ""}>{a.error_message || "—"}</TableCell>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function KpiCard({ icon: Icon, label, value, suffix, highlight, destructive }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  suffix?: string;
  highlight?: boolean;
  destructive?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : destructive ? "border-destructive/30 bg-destructive/5" : ""}>
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <Icon className={destructive ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"} />
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={destructive ? "text-lg font-bold text-destructive" : "text-lg font-bold text-foreground"}>{value}</span>
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
