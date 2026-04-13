import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  MousePointerClick,
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
import { subDays, format } from "date-fns";

const PERIOD_DAYS = 14;

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
function buildDayEntries(days: number) {
  const entries: { key: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = subDays(new Date(), days - 1 - i);
    entries.push({ key: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM") });
  }
  return entries;
}

export default function Dashboard() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const periodStart = subDays(new Date(), PERIOD_DAYS).toISOString();

  const { data: orders = [] } = useQuery({
    queryKey: ["dashboard-orders", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total, created_at, customer_id")
        .eq("tenant_id", tenantId!)
        .gte("created_at", periodStart)
        .order("created_at");
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["dashboard-customers", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, total_spent, total_orders, avg_ticket, last_order_at, created_at")
        .eq("tenant_id", tenantId!);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["dashboard-activities", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_activities")
        .select("status, clicked_at, converted_at, conversion_value, created_at")
        .eq("tenant_id", tenantId!)
        .gte("created_at", periodStart);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: clicks = [] } = useQuery({
    queryKey: ["dashboard-clicks", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tracked_links" as any)
        .select("id, created_at")
        .eq("tenant_id", tenantId!);

      if (!data || data.length === 0) return [];

      const linkIds = (data as any[]).map((l: any) => l.id);
      const { data: clickData } = await supabase
        .from("link_clicks" as any)
        .select("link_id, clicked_at")
        .in("link_id", linkIds)
        .gte("clicked_at", periodStart);
      return clickData || [];
    },
    enabled: !!tenantId,
  });

  // Compute KPIs
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const martzRevenue = activities
    .filter((a: any) => a.converted_at)
    .reduce((s: number, a: any) => s + Number(a.conversion_value || 0), 0);
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
        const days = (new Date(c.last_order_at!).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return s + days / ((c.total_orders || 2) - 1);
      }, 0) / customersWithMultiple.length
    : 0;

  const totalClicks = (clicks as any[]).length;

  const kpis = [
    { label: "Receita Total", value: fmtMoney(totalRevenue), icon: DollarSign },
    { label: "Receita Martz", value: fmtMoney(martzRevenue), icon: Target },
    { label: "Clientes", value: fmtNumber(totalCustomers), icon: Users },
    { label: "Pedidos", value: fmtNumber(totalOrders), icon: ShoppingCart },
    { label: "Ticket Médio", value: fmtMoney(avgTicket), icon: TrendingUp },
    { label: "LTV", value: fmtMoney(ltv), icon: BarChart3 },
    { label: "Freq. Compra", value: `${avgFrequency.toFixed(1)}x`, icon: Repeat },
    { label: "Tempo entre Pedidos", value: avgDaysBetween > 0 ? `${Math.round(avgDaysBetween)} dias` : "—", icon: Clock },
    { label: "Cliques", value: fmtNumber(totalClicks), icon: MousePointerClick },
  ];

  // Chart data: group orders by day using full date key
  const dayEntries = buildDayEntries(PERIOD_DAYS);
  const dayMap: Record<string, { label: string; receita: number; pedidos: number }> = {};
  dayEntries.forEach(({ key, label }) => {
    dayMap[key] = { label, receita: 0, pedidos: 0 };
  });
  orders.forEach((o) => {
    const key = format(new Date(o.created_at), "yyyy-MM-dd");
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

  // Chart data: new vs returning by day
  const newCustomerIds = new Set(
    customers
      .filter((c) => new Date(c.created_at) >= new Date(periodStart))
      .map((c) => c.id)
  );
  const customerDayMap: Record<string, { label: string; novos: number; recorrentes: number }> = {};
  dayEntries.forEach(({ key, label }) => {
    customerDayMap[key] = { label, novos: 0, recorrentes: 0 };
  });
  orders.forEach((o) => {
    const key = format(new Date(o.created_at), "yyyy-MM-dd");
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Indicadores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral de {currentTenant?.name || "sua loja"} • Últimos {PERIOD_DAYS} dias
          </p>
        </div>

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
      </div>
    </AppLayout>
  );
}
