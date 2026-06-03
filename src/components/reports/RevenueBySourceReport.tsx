import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { Download, TrendingUp, Info } from "lucide-react";
import * as XLSX from "xlsx";
import { fmtMoney, fmtNumber, fmtPct, CHART_COLORS, sourceLabel, methodLabel } from "./format";

type SourceRow = { origem: string; receita: number; pedidos: number };
type MethodRow = { metodo: string; receita: number; pedidos: number };
type CampaignRow = { campaignId: string | null; nome: string; origem: string; receita: number; pedidos: number };
type Payload = {
  total: number;
  orders: number;
  bySource: SourceRow[];
  byMethod: MethodRow[];
  byCampaign: CampaignRow[];
};

interface Props {
  tenantId: string;
  from: Date;
  to: Date;
  periodLabel: string;
}

export default function RevenueBySourceReport({ tenantId, from, to, periodLabel }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-revenue-by-source", tenantId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_report_revenue_by_source", {
        p_tenant: tenantId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return data as unknown as Payload;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const total = data?.total ?? 0;
  const orders = data?.orders ?? 0;
  const bySource = data?.bySource ?? [];
  const byMethod = data?.byMethod ?? [];
  const byCampaign = data?.byCampaign ?? [];

  const pieData = bySource.map((s) => ({ name: sourceLabel(s.origem), value: Number(s.receita) }));

  const exportCsv = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        bySource.map((s) => ({
          Origem: sourceLabel(s.origem),
          Receita: Number(s.receita),
          Conversoes: Number(s.pedidos),
          Percentual: fmtPct(Number(s.receita), total),
        }))
      ),
      "Por origem"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        byCampaign.map((c) => ({
          Campanha: c.nome,
          Origem: sourceLabel(c.origem),
          Receita: Number(c.receita),
          Conversoes: Number(c.pedidos),
        }))
      ),
      "Por campanha"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        byMethod.map((m) => ({
          Metodo: methodLabel(m.metodo),
          Receita: Number(m.receita),
          Conversoes: Number(m.pedidos),
        }))
      ),
      "Por metodo"
    );
    XLSX.writeFile(wb, `receita-gerada-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[140px] w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero + ação */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="rounded-2xl gradient-cyan text-white shadow-lg p-6 flex-1">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <TrendingUp className="h-4 w-4" />
            <span>Receita Gerada • {periodLabel}</span>
          </div>
          <div className="text-3xl font-bold font-heading">{fmtMoney(total)}</div>
          <div className="text-white/80 text-sm mt-1">
            {fmtNumber(orders)} conversões atribuídas a campanhas/mensagens (Efeito Halo, 72h)
          </div>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={total === 0} className="gap-2">
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Info className="h-6 w-6 mx-auto mb-2 opacity-60" />
            Nenhuma receita atribuída a campanhas neste período.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Donut por origem */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita por origem</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip formatter={(v: number) => fmtMoney(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tabela por origem */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhe por canal/origem</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bySource.map((s, i) => (
                      <TableRow key={s.origem}>
                        <TableCell className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          {sourceLabel(s.origem)}
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(Number(s.receita))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(s.pedidos))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtPct(Number(s.receita), total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Por campanha */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">De onde veio — por campanha</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCampaign.map((c, i) => (
                    <TableRow key={`${c.campaignId}-${c.origem}-${i}`}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sourceLabel(c.origem)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmtMoney(Number(c.receita))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(c.pedidos))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtPct(Number(c.receita), total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Por método de atribuição */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por método de atribuição</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMethod.map((m) => (
                    <TableRow key={m.metodo}>
                      <TableCell>{methodLabel(m.metodo)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtMoney(Number(m.receita))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(m.pedidos))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtPct(Number(m.receita), total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
