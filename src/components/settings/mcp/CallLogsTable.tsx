import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatSP } from "@/lib/utils";

export function CallLogsTable({ logs }: { logs: any[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/10">
        Nenhuma atividade recente.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Data/Hora</TableHead>
            <TableHead>Resultado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-mono text-xs">{log.tool_name}</TableCell>
              <TableCell>
                <Badge variant={log.status === "success" ? "outline" : "destructive"} className={log.status === "success" ? "text-green-500 border-green-500" : ""}>
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">{log.duration_ms}ms</TableCell>
              <TableCell className="text-xs">{formatSP(new Date(log.created_at), "dd/MM HH:mm:ss")}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">
                {log.result_summary || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
