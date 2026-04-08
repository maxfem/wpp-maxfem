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
import { subDays, format, startOfDay } from "date-fns";

const PERIOD_DAYS = 14;

export default function Dashboard() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const periodStart = subDays(new Date(), PERIOD_DAYS).toISOString();

  // Orders in period
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

  // Customers aggregate
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

  // Campaign activities with conversions
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

  // Link clicks in period
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

  // Avg days between orders
  const customersWithMultiple = activeCustomers.filter((c) => (c.total_orders || 0) > 1 && c.last_order_at && c.created_at);
  const avgDaysBetween = customersWithMultiple.length > 0
    ? customersWithMultiple.reduce((s, c) => {
        const days = (new Date(c.last_order_at!).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return s + days / ((c.total_orders || 2) - 1);
      }, 0) / customersWithMultiple.length
    : 0;

  const totalClicks = (clicks as any[]).length;

  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
  const fmtMoney = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const kpis = [
    { label: "Receita Total", value: fmtMoney(totalRevenue), icon: DollarSign },
    { label: "Receita Martz", value: fmtMoney(martzRevenue), icon: Target },
    { label: "Clientes", value: fmt(totalCustomers), icon: Users },
    { label: "Pedidos", value: fmt(totalOrders), icon: ShoppingCart },
    { label: "Ticket Médio", value: fmtMoney(avgTicket), icon: TrendingUp },
    { label: "LTV", value: fmtMoney(ltv), icon: BarChart3 },
    { label: "Freq. Compra", value: `${avgFrequency.toFixed(1)}x`, icon: Repeat },
    { label: "Tempo entre Pedidos", value: avgDaysBetween > 0 ? `${Math.round(avgDaysBetween)} dias` : "—", icon: Clock },
    { label: "Cliques", value: fmt(totalClicks), icon: MousePointerClick },
  ];

  // Chart data: group orders by day
  const dayMap: Record<string, { receita: number; pedidos: number }> = {};
  for (let i = 0; i < PERIOD_DAYS; i++) {
    const d = format(subDays(new Date(), PERIOD_DAYS - 1 - i), "dd");
    dayMap[d] = { receita: 0, pedidos: 0 };
  }
  orders.forEach((o) => {
    const d = format(new Date(o.created_at), "dd");
    if (dayMap[d]) {
      dayMap[d].receita += Number(o.total || 0);
      dayMap[d].pedidos += 1;
    }
  });
  const revenueData = Object.entries(dayMap).map(([day, v]) => ({ day, ...v }));

  // Chart data: new vs returning by day
  const newCustomerIds = new Set(
    customers
      .filter((c) => new Date(c.created_at) >= new Date(periodStart))
      .map((c) => c.id)
  );
  const customerDayMap: Record<string, { novos: number; recorrentes: number }> = {};
  for (let i = 0; i < PERIOD_DAYS; i++) {
    const d = format(subDays(new Date(), PERIOD_DAYS - 1 - i), "dd");
    customerDayMap[d] = { novos: 0, recorrentes: 0 };
  }
  orders.forEach((o) => {
    const d = format(new Date(o.created_at), "dd");
    if (customerDayMap[d]) {
      if (newCustomerIds.has(o.customer_id)) {
        customerDayMap[d].novos += Number(o.total || 0);
      } else {
        customerDayMap[d].recorrentes += Number(o.total || 0);
      }
    }
  });
  const customerTypeData = Object.entries(customerDayMap).map(([day, v]) => ({ day, ...v }));

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
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
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
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
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
