import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney, fmtNumber, fmtPct } from "./format";

type StatusRow = { status: string; pedidos: number; receita: number; pago: boolean };
type Payload = {
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  newRevenue: number;
  returningRevenue: number;
  byStatus: StatusRow[];
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Pago",
  invoiced: "Faturado",
  approved: "Aprovado",
  shipped: "Enviado",
  on_carriage: "Em transporte",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  pix_pending: "Pix pendente",
  pending: "Pendente",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  test: "Teste",
  indefinido: "Indefinido",
};
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

interface Props {
  tenantId: string;
  from: Date;
  to: Date;
}

export default function SalesReport({ tenantId, from, to }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-sales", tenantId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_report_sales", {
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[110px] rounded-2xl" />)}
        </div>
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    );
  }

  const p = data;
  const paidRevenue = p?.totalRevenue ?? 0;
  const newR = p?.newRevenue ?? 0;
  const retR = p?.returningRevenue ?? 0;
  const newRetTotal = newR + retR;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Receita paga</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(paidRevenue)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Pedidos pagos</div>
          <div className="text-2xl font-bold mt-1">{fmtNumber(p?.totalOrders ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Ticket médio</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(p?.avgTicket ?? 0)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Novos x recorrentes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Novos clientes</span>
            <span className="font-medium">{fmtMoney(newR)} <span className="text-muted-foreground">({fmtPct(newR, newRetTotal)})</span></span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden flex">
            <div className="h-full bg-neon-magenta" style={{ width: fmtPct(newR, newRetTotal) }} />
            <div className="h-full bg-[#40E0D0]" style={{ width: fmtPct(retR, newRetTotal) }} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Recorrentes</span>
            <span className="font-medium">{fmtMoney(retR)} <span className="text-muted-foreground">({fmtPct(retR, newRetTotal)})</span></span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pedidos por status</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(p?.byStatus ?? []).map((s) => (
                <TableRow key={s.status}>
                  <TableCell className="flex items-center gap-2">
                    {statusLabel(s.status)}
                    {s.pago && <Badge variant="secondary" className="text-[10px]">pago</Badge>}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(s.pedidos))}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(Number(s.receita))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
