import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Info } from "lucide-react";
import * as XLSX from "xlsx";
import { fmtMoney, fmtNumber, fmtPct, sourceLabel } from "./format";

type Row = {
  campaign_id: string | null;
  nome: string;
  tipo: string;
  origem: string;
  envios: number;
  cliques: number;
  conversoes: number;
  receita: number;
};

interface Props {
  tenantId: string;
  from: Date;
  to: Date;
}

export default function CampaignsReport({ tenantId, from, to }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-campaigns", tenantId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_report_campaigns", {
        p_tenant: tenantId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const rows = data ?? [];

  const exportCsv = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Campanha: r.nome,
          Tipo: r.tipo,
          Origem: sourceLabel(r.origem),
          Envios: Number(r.envios),
          Cliques: Number(r.cliques),
          Conversoes: Number(r.conversoes),
          Receita: Number(r.receita),
        }))
      ),
      "Campanhas"
    );
    XLSX.writeFile(wb, `campanhas-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`);
  };

  if (isLoading) return <Skeleton className="h-[400px] rounded-2xl" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Performance por campanha</CardTitle>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Exportar
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Info className="h-6 w-6 mx-auto mb-2 opacity-60" />
            Nenhuma atividade de campanha neste período.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Envios</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Taxa conv.</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.campaign_id}-${r.origem}-${i}`}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell><Badge variant="secondary">{sourceLabel(r.origem)}</Badge></TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(r.envios))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(r.cliques))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtNumber(Number(r.conversoes))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmtPct(Number(r.conversoes), Number(r.envios))}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(Number(r.receita))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
