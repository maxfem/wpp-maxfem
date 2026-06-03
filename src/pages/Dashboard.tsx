import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  DollarSign,
  Users,
  ShoppingCart,
  TrendingUp,
  Repeat,
  Clock,
  Target,
  BarChart3,
  CalendarIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatSP, getStandardPeriodRange, type DatePeriodKey, toSaoPaulo } from "@/lib/utils";
import TrackingDashboard from "@/components/dashboard/TrackingDashboard";
import { KPIGradientCard } from "@/components/dashboard/KPIGradientCard";
import { MiniMetricCard } from "@/components/dashboard/MiniMetricCard";
import type { DateRange } from "react-day-picker";

type PeriodKey = DatePeriodKey;

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

const fmtNumber = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 10_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};

const fmtMoney = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtMoneyShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 10_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

function buildDayEntries(from: Date, to: Date) {
  const entries: { key: string; label: string }[] = [];
  const days = differenceInDays(to, from) + 1;
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    entries.push({ key: formatSP(d, "yyyy-MM-dd"), label: formatSP(d, "dd/MM") });
  }
  return entries;
}

const CHART_COLORS = ["#3B82F6", "#40E0D0", "#A855F7", "#1E5F8B", "#FF2D92"];

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md px-4 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-semibold text-foreground">
          {formatter ? formatter(p.value, p.name) : `${p.name}: ${p.value}`}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const [periodKey, setPeriodKey] = useState<PeriodKey>("today");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { from: periodFrom, to: periodTo, days: periodDays } = useMemo(
    () => getStandardPeriodRange(periodKey, customRange),
    [periodKey, customRange]
  );

  const periodLabel = useMemo(() => {
    if (periodKey === "custom" && customRange?.from && customRange?.to) {
      return `${formatSP(customRange.from, "dd/MM/yyyy")} — ${formatSP(customRange.to, "dd/MM/yyyy")}`;
    }
    return PERIOD_OPTIONS.find((p) => p.key === periodKey)?.label || "";
  }, [periodKey, customRange]);

  // Agregados via RPC (eliminou fetchAll de 75k+ customers / milhões de activities)
  type KpiPayload = {
    totalRevenue: number;
    totalOrders: number;
    daily: { date: string; receita: number; pedidos: number; novos: number; recorrentes: number }[];
    weekday: Record<string, number>;
  };
  type CustAggPayload = { totalCustomers: number; activeCustomers: number; ltv: number; avgFreq: number; avgDaysBetween: number };
  type ActivityKpiPayload = { martzRevenue: number; statusCounts: Record<string, number> };

  const { data: kpis } = useQuery({
    queryKey: ["dashboard-kpis-rpc", tenantId, periodFrom.toISOString(), periodTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_dashboard_kpis", {
        p_tenant: tenantId!, p_from: periodFrom.toISOString(), p_to: periodTo.toISOString(),
      });
      if (error) throw error;
      return data as KpiPayload;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: custAgg } = useQuery({
    queryKey: ["dashboard-customer-agg-rpc", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_dashboard_customer_aggregates", { p_tenant: tenantId! });
      if (error) throw error;
      return data as CustAggPayload;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: actKpi } = useQuery({
    queryKey: ["dashboard-activity-kpi-rpc", tenantId, periodFrom.toISOString(), periodTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_dashboard_activity_kpis", {
        p_tenant: tenantId!, p_from: periodFrom.toISOString(), p_to: periodTo.toISOString(),
      });
      if (error) throw error;
      return data as ActivityKpiPayload;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  // KPIs computados pelo backend
  const totalRevenue = kpis?.totalRevenue ?? 0;
  const totalOrders = kpis?.totalOrders ?? 0;
  const martzRevenue = actKpi?.martzRevenue ?? 0;
  const totalCustomers = custAgg?.totalCustomers ?? 0;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const ltv = custAgg?.ltv ?? 0;
  const avgFrequency = custAgg?.avgFreq ?? 0;
  const avgDaysBetween = custAgg?.avgDaysBetween ?? 0;

  // Chart data — vem da série diária pré-agregada
  const dayEntries = buildDayEntries(periodFrom, periodTo);
  const dailyByDate: Record<string, { receita: number; pedidos: number; novos: number; recorrentes: number }> = {};
  (kpis?.daily ?? []).forEach((d) => {
    dailyByDate[d.date] = { receita: Number(d.receita || 0), pedidos: Number(d.pedidos || 0), novos: Number(d.novos || 0), recorrentes: Number(d.recorrentes || 0) };
  });
  const revenueData = dayEntries.map(({ key, label }) => {
    const d = dailyByDate[key] || { receita: 0, pedidos: 0, novos: 0, recorrentes: 0 };
    return { day: label, receita: d.receita, pedidos: d.pedidos };
  });
  const customerTypeData = dayEntries.map(({ key, label }) => {
    const d = dailyByDate[key] || { receita: 0, pedidos: 0, novos: 0, recorrentes: 0 };
    return { day: label, novos: d.novos, recorrentes: d.recorrentes };
  });

  const statusCounts = actKpi?.statusCounts ?? {};
  const statusLabels: Record<string, string> = {
    sent: "Enviados",
    delivered: "Entregues",
    read: "Lidos",
    clicked: "Clicados",
    converted: "Convertidos",
    failed: "Falhas",
  };
  const donutData = Object.entries(statusCounts).map(([key, count]) => ({
    name: statusLabels[key] || key,
    value: count,
  }));

  // Orders by weekday (já agregado no RPC)
  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const weekdayMap = weekdayNames.map((name, idx) => ({
    name,
    pedidos: Number(kpis?.weekday?.[String(idx)] || 0),
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">Indicadores</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão geral de {currentTenant?.name || "sua loja"} • {periodLabel}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {PERIOD_OPTIONS.map((opt) =>
              opt.key === "custom" ? (
                <Popover key={opt.key} open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={periodKey === "custom" ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5"
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {periodKey === "custom" && customRange?.from && customRange?.to
                        ? `${formatSP(customRange.from, "dd/MM")} — ${formatSP(customRange.to, "dd/MM")}`
                        : opt.label}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={(range) => {
                        setCustomRange(range);
                        if (range?.from && range?.to) {
                          setPeriodKey("custom");
                          setCalendarOpen(false);
                        }
                      }}
                      locale={ptBR}
                      numberOfMonths={2}
                      disabled={{ after: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  key={opt.key}
                  variant={periodKey === opt.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodKey(opt.key)}
                >
                  {opt.label}
                </Button>
              )
            )}
          </div>
        </motion.div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Hero KPI gradient cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPIGradientCard
                title="Receita Total"
                value={fmtMoney(totalRevenue)}
                gradient="pink"
                tooltip="Valor total bruto de todos os pedidos aprovados e completos no período selecionado."
              />
              <KPIGradientCard
                title={"Receita\nGerada"}
                value={fmtMoney(martzRevenue)}
                gradient="cyan"
                tooltip="Receita de clientes que receberam mensagens e converteram em até 72h (Efeito Halo). Clique para ver de onde veio."
                onClick={() => navigate("/relatorios?tab=revenue")}
              />
              <KPIGradientCard
                title="LTV Médio"
                value={fmtMoney(ltv)}
                gradient="magenta"
              />
              <KPIGradientCard
                title="Ticket Médio"
                value={fmtMoney(avgTicket)}
                gradient="purple"
              />
            </div>

            {/* Mini metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniMetricCard icon={Users} label="Clientes" value={fmtNumber(totalCustomers)} />
              <MiniMetricCard icon={ShoppingCart} label="Pedidos" value={fmtNumber(totalOrders)} />
              <MiniMetricCard icon={Repeat} label="Freq. Compra" value={`${avgFrequency.toFixed(1)}x`} />
              <MiniMetricCard
                icon={Clock}
                label="Tempo entre Pedidos"
                value={avgDaysBetween > 0 ? `${Math.round(avgDaysBetween)} dias` : "—"}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Line Chart */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border border-border glass">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Receita por Dia</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={revenueData}>
                        <defs>
                          <linearGradient id="gradientReceita" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#40E0D0" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#40E0D0" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={fmtMoneyShort} />
                        <Tooltip content={<CustomTooltip formatter={(v: number) => fmtMoney(v)} />} />
                        <Area
                          type="monotone"
                          dataKey="receita"
                          stroke="#40E0D0"
                          strokeWidth={2.5}
                          fill="url(#gradientReceita)"
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* New vs Returning */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border border-border glass">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Novos vs Recorrentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={customerTypeData}>
                        <defs>
                          <linearGradient id="gradientRec" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#A855F7" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradientNew" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#40E0D0" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#40E0D0" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={fmtMoneyShort} />
                        <Tooltip content={<CustomTooltip formatter={(v: number, n: string) => `${n === "recorrentes" ? "Recorrentes" : "Novos"}: ${fmtMoney(v)}`} />} />
                        <Area type="monotone" dataKey="recorrentes" stackId="1" stroke="#A855F7" strokeWidth={2} fill="url(#gradientRec)" />
                        <Area type="monotone" dataKey="novos" stackId="1" stroke="#40E0D0" strokeWidth={2} fill="url(#gradientNew)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Status Donut Chart */}
              {donutData.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <Card className="border border-border glass">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Atividades por Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            animationDuration={1200}
                          >
                            {donutData.map((_entry, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "12px",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-3 justify-center mt-2">
                        {donutData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div
                              className="h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ring-offset-card"
                              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length], borderColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                            {d.name}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Orders by Weekday Bar Chart */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Card className="border border-border glass">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Pedidos por Dia da Semana</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={weekdayMap}>
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#40E0D0" />
                            <stop offset="100%" stopColor="#8B5CF6" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "12px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar
                          dataKey="pedidos"
                          fill="url(#barGradient)"
                          radius={[6, 6, 0, 0]}
                          barSize={32}
                          animationDuration={1200}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>

          <TabsContent value="tracking" className="mt-4">
            <TrackingDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
