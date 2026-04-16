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
} from "recharts";
import { subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatSP } from "@/lib/utils";
import TrackingDashboard from "@/components/dashboard/TrackingDashboard";
import type { DateRange } from "react-day-picker";

// Fetch all rows bypassing the 1000-row default limit
async function fetchAll<T>(query: any): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  let all: T[] = [];
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

function getPeriodRange(key: PeriodKey, customRange?: DateRange): { from: Date; to: Date; days: number } {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), days: 1 };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y), days: 1 };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), days: 7 };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), days: 30 };
    case "custom": {
      if (customRange?.from && customRange?.to) {
        const days = differenceInDays(customRange.to, customRange.from) + 1;
        return { from: startOfDay(customRange.from), to: endOfDay(customRange.to), days };
      }
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), days: 7 };
    }
  }
}

// Brazilian number formatting helpers
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

// Build ordered day keys for the period
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

export default function Dashboard() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const [periodKey, setPeriodKey] = useState<PeriodKey>("today");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { from: periodFrom, to: periodTo, days: periodDays } = useMemo(
    () => getPeriodRange(periodKey, customRange),
    [periodKey, customRange]
  );

  const periodStartISO = periodFrom.toISOString();
  const periodEndISO = periodTo.toISOString();

  const periodLabel = useMemo(() => {
    if (periodKey === "custom" && customRange?.from && customRange?.to) {
      return `${formatSP(customRange.from, "dd/MM/yyyy")} — ${formatSP(customRange.to, "dd/MM/yyyy")}`;
    }
    return PERIOD_OPTIONS.find((p) => p.key === periodKey)?.label || "";
  }, [periodKey, customRange]);

  const { data: orders = [] } = useQuery({
    queryKey: ["dashboard-orders", tenantId, periodStartISO, periodEndISO],
    queryFn: () =>
      fetchAll<{ total: number; created_at: string; customer_id: string }>(
        supabase
          .from("orders")
          .select("total, created_at, customer_id")
          .eq("tenant_id", tenantId!)
          .gte("created_at", periodStartISO)
          .lte("created_at", periodEndISO)
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
    queryKey: ["dashboard-activities", tenantId, periodStartISO, periodEndISO],
    queryFn: () =>
      fetchAll<{ status: string; clicked_at: string | null; converted_at: string | null; conversion_value: number | null; created_at: string }>(
        supabase
          .from("campaign_activities")
          .select("status, clicked_at, converted_at, conversion_value, created_at")
          .eq("tenant_id", tenantId!)
          .gte("created_at", periodStartISO)
          .lte("created_at", periodEndISO)
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

  const kpis = [
    { label: "Receita Total", value: fmtMoney(totalRevenue), icon: DollarSign },
    { label: "Receita Martz", value: fmtMoney(martzRevenue), icon: Target },
    { label: "Clientes", value: fmtNumber(totalCustomers), icon: Users },
    { label: "Pedidos", value: fmtNumber(totalOrders), icon: ShoppingCart },
    { label: "Ticket Médio", value: fmtMoney(avgTicket), icon: TrendingUp },
    { label: "LTV", value: fmtMoney(ltv), icon: BarChart3 },
    { label: "Freq. Compra", value: `${avgFrequency.toFixed(1)}x`, icon: Repeat },
    { label: "Tempo entre Pedidos", value: avgDaysBetween > 0 ? `${Math.round(avgDaysBetween)} dias` : "—", icon: Clock },
  ];

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

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Indicadores</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão geral de {currentTenant?.name || "sua loja"} • {periodLabel}
            </p>
          </div>

          {/* Period selector */}
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
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className="border border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                      <kpi.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-xl font-bold text-foreground">{kpi.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-foreground">
                    Receita e Pedidos por Dia
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmtMoneyShort(v)} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number) => [fmtMoney(value), "Receita"]}
                      />
                      <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-foreground">
                    Faturamento: Novos vs Recorrentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={customerTypeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmtMoneyShort(v)} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number, name: string) => [fmtMoney(value), name === "recorrentes" ? "Recorrentes" : "Novos"]}
                      />
                      <Area type="monotone" dataKey="recorrentes" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                      <Area type="monotone" dataKey="novos" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
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
