import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  Users,
  ShoppingCart,
  TrendingUp,
  Repeat,
  Clock,
  Target,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";

const kpis = [
  { label: "Receita Total", value: "R$ 127.450", change: "+12.5%", icon: DollarSign, positive: true },
  { label: "Receita Martz", value: "R$ 34.200", change: "+8.3%", icon: Target, positive: true },
  { label: "Clientes", value: "4.476", change: "+156", icon: Users, positive: true },
  { label: "Pedidos", value: "892", change: "+5.2%", icon: ShoppingCart, positive: true },
  { label: "Ticket Médio", value: "R$ 142,89", change: "-2.1%", icon: TrendingUp, positive: false },
  { label: "LTV", value: "R$ 487,30", change: "+15.4%", icon: BarChart3, positive: true },
  { label: "Freq. Compra", value: "2.3x", change: "+0.2", icon: Repeat, positive: true },
  { label: "Tempo entre Pedidos", value: "32 dias", change: "-3 dias", icon: Clock, positive: true },
];

const revenueData = [
  { day: "01", receita: 4200, pedidos: 28 },
  { day: "02", receita: 3800, pedidos: 25 },
  { day: "03", receita: 5100, pedidos: 34 },
  { day: "04", receita: 4700, pedidos: 31 },
  { day: "05", receita: 6200, pedidos: 41 },
  { day: "06", receita: 5500, pedidos: 36 },
  { day: "07", receita: 4900, pedidos: 32 },
  { day: "08", receita: 7100, pedidos: 47 },
  { day: "09", receita: 6800, pedidos: 45 },
  { day: "10", receita: 5300, pedidos: 35 },
  { day: "11", receita: 4600, pedidos: 30 },
  { day: "12", receita: 5900, pedidos: 39 },
  { day: "13", receita: 6500, pedidos: 43 },
  { day: "14", receita: 7200, pedidos: 48 },
];

const customerTypeData = [
  { day: "01", novos: 1200, recorrentes: 3000 },
  { day: "02", novos: 900, recorrentes: 2900 },
  { day: "03", novos: 1500, recorrentes: 3600 },
  { day: "04", novos: 1100, recorrentes: 3600 },
  { day: "05", novos: 1800, recorrentes: 4400 },
  { day: "06", novos: 1400, recorrentes: 4100 },
  { day: "07", novos: 1000, recorrentes: 3900 },
  { day: "08", novos: 2100, recorrentes: 5000 },
  { day: "09", novos: 1900, recorrentes: 4900 },
  { day: "10", novos: 1300, recorrentes: 4000 },
  { day: "11", novos: 1000, recorrentes: 3600 },
  { day: "12", novos: 1600, recorrentes: 4300 },
  { day: "13", novos: 1700, recorrentes: 4800 },
  { day: "14", novos: 2200, recorrentes: 5000 },
];

export default function Dashboard() {
  const { currentTenant } = useAuth();

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Indicadores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral de {currentTenant?.name || "sua loja"} • Últimos 14 dias
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                  <kpi.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold text-foreground">{kpi.value}</div>
                <span
                  className={`text-xs font-medium ${
                    kpi.positive ? "text-success" : "text-destructive"
                  }`}
                >
                  {kpi.change}
                </span>
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
                  <Line type="monotone" dataKey="pedidos" stroke="hsl(var(--success))" strokeWidth={2} />
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
                  <Area
                    type="monotone"
                    dataKey="recorrentes"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.2)"
                  />
                  <Area
                    type="monotone"
                    dataKey="novos"
                    stackId="1"
                    stroke="hsl(var(--success))"
                    fill="hsl(var(--success) / 0.2)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
