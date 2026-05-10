import { useState, useMemo } from "react";
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
import { formatSP, getStandardPeriodRange, type DatePeriodKey, toSaoPaulo, fetchAll } from "@/lib/utils";
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

  // Só pedidos com pagamento confirmado contam pra receita/indicadores (alinha com o card "Receita" da Yampi)
  const PAID_STATUSES = ["paid", "invoiced", "approved", "shipped", "on_carriage", "in_transit", "delivered"];
  const { data: orders = [] } = useQuery({
    queryKey: ["dashboard-orders", tenantId, periodFrom.toISOString(), periodTo.toISOString()],
    queryFn: () =>
      fetchAll<{ total: number; created_at: string; customer_id: string }>(
        supabase
          .from("orders")
          .select("total, created_at, customer_id")
          .eq("tenant_id", tenantId!)
          .in("mapped_status", PAID_STATUSES)
          .gte("created_at", periodFrom.toISOString())
          .lte("created_at", periodTo.toISOString())
          .order("created_at")
      ),
    enabled: !!tenantId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["dashboard-customers", tenantId],
    queryFn: () =>
      fetchAll<{ id: string; total_spent: number | null; total_orders: number | null; avg_ticket: number | null; last_order_at: string | null; created_at: string }>(
        supabase
          .from("customers")
          .select("id, total_spent, total_orders, avg_ticket, last_order_at, created_at")
          .eq("tenant_id", tenantId!)
      ),
    enabled: !!tenantId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["dashboard-activities", tenantId, periodFrom.toISOString(), periodTo.toISOString()],
    queryFn: () =>
      fetchAll<{ status: string; clicked_at: string | null; converted_at: string | null; conversion_value: number | null; created_at: string }>(
        supabase
          .from("campaign_activities")
          .select("status, clicked_at, converted_at, conversion_value, created_at")
          .eq("tenant_id", tenantId!)
          .gte("created_at", periodFrom.toISOString())
          .lte("created_at", periodTo.toISOString())
      ),
    enabled: !!tenantId,
  });

  // Compute KPIs
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const martzRevenue = activities
    .filter((a) => a.converted_at)
    .reduce((s, a) => s + Number(a.conversion_value || 0), 0);
  const totalCustomers = customers.length;
  const totalOrders = orders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const activeCustomers = customers.filter((c) => (c.total_orders || 0) > 0);
  const ltv = activeCustomers.length > 0
    ? activeCustomers.reduce((s, c) => s + Number(c.total_spent || 0), 0) / activeCustomers.length
    : 0;
  const avgFrequency = activeCustomers.length > 0
    ? activeCustomers.reduce((s, c) => s + (c.total_orders || 0), 0) / activeCustomers.length
    : 0;

  const customersWithMultiple = activeCustomers.filter((c) => (c.total_orders || 0) > 1 && c.last_order_at && c.created_at);
  const avgDaysBetween = customersWithMultiple.length > 0
    ? customersWithMultiple.reduce((s, c) => {
        const d = (new Date(c.last_order_at!).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return s + d / ((c.total_orders || 2) - 1);
      }, 0) / customersWithMultiple.length
    : 0;

  // Chart data
  const dayEntries = buildDayEntries(periodFrom, periodTo);
  const dayMap: Record<string, { label: string; receita: number; pedidos: number }> = {};
  dayEntries.forEach(({ key, label }) => {
    dayMap[key] = { label, receita: 0, pedidos: 0 };
  });
  orders.forEach((o) => {
    const key = formatSP(new Date(o.created_at), "yyyy-MM-dd");
    if (dayMap[key]) {
      dayMap[key].receita += Number(o.total || 0);
      dayMap[key].pedidos += 1;
    }
  });
  const revenueData = dayEntries.map(({ key }) => ({
    day: dayMap[key].label,
    receita: dayMap[key].receita,
    pedidos: dayMap[key].pedidos,
  }));

  // New vs returning
  const newCustomerIds = new Set(
    customers
      .filter((c) => new Date(c.created_at) >= periodFrom)
      .map((c) => c.id)
  );
  const customerDayMap: Record<string, { label: string; novos: number; recorrentes: number }> = {};
  dayEntries.forEach(({ key, label }) => {
    customerDayMap[key] = { label, novos: 0, recorrentes: 0 };
  });
  orders.forEach((o) => {
    const key = formatSP(new Date(o.created_at), "yyyy-MM-dd");
    if (customerDayMap[key]) {
      if (newCustomerIds.has(o.customer_id)) {
        customerDayMap[key].novos += Number(o.total || 0);
      } else {
        customerDayMap[key].recorrentes += Number(o.total || 0);
      }
    }
  });
  const customerTypeData = dayEntries.map(({ key }) => ({
    day: customerDayMap[key].label,
    novos: customerDayMap[key].novos,
    recorrentes: customerDayMap[key].recorrentes,
  }));

  // Activity status distribution for donut chart
  const statusCounts = activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
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

  // Orders by weekday for bar chart
  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const weekdayMap = weekdayNames.map((name) => ({ name, pedidos: 0 }));
  orders.forEach((o) => {
    const dow = new Date(o.created_at).getDay();
    weekdayMap[dow].pedidos += 1;
  });

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
                tooltip="Receita de clientes que receberam mensagens e converteram em até 72h (Efeito Halo)."
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
