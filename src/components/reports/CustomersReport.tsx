import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, Cell } from "recharts";
import { fmtMoney, fmtNumber, fmtPct, CHART_COLORS } from "./format";

type SegRow = { segmento: string; clientes: number; receita: number };
type Payload = {
  totalCustomers: number;
  activeCustomers: number;
  avgLtv: number;
  cashbackOutstanding: number;
  bySegment: SegRow[];
};

interface Props {
  tenantId: string;
}

export default function CustomersReport({ tenantId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-customers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_report_customers", { p_tenant: tenantId });
      if (error) throw error;
      return data as unknown as Payload;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[110px] rounded-2xl" />)}
        </div>
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    );
  }

  const p = data;
  const segments = p?.bySegment ?? [];
  const totalSegRevenue = segments.reduce((a, s) => a + Number(s.receita), 0);
  const chartData = segments.map((s) => ({ name: s.segmento, receita: Number(s.receita), clientes: Number(s.clientes) }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Clientes</div>
          <div className="text-2xl font-bold mt-1">{fmtNumber(p?.totalCustomers ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Compradores</div>
          <div className="text-2xl font-bold mt-1">{fmtNumber(p?.activeCustomers ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">LTV médio</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(p?.avgLtv ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Cashback em aberto</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(p?.cashbackOutstanding ?? 0)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Receita por segmento RFM</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <RTooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="receita" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhe por segmento</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segmento</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((s) => (
                <TableRow key={s.segmento}>
                  <TableCell className="font-medium">{s.segmento}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(s.clientes))}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(Number(s.receita))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtPct(Number(s.receita), totalSegRevenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
