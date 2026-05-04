import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Filter, Eye, History, User } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function AuditLogs() {
  const { currentTenant } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          *,
          profiles:user_id (display_name)
        `)
        .eq("tenant_id", currentTenant?.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const filteredLogs = logs?.filter(log => 
    log.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.profiles?.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT': return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">Inserção</Badge>;
      case 'UPDATE': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Edição</Badge>;
      case 'DELETE': return <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20">Exclusão</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <History className="h-6 w-6 text-primary" /> Log de Auditoria
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rastreamento completo de ações administrativas e alterações de dados.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por entidade, ação..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Atividades do Sistema</CardTitle>
            <CardDescription>Visualizando as últimas 100 alterações significativas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>ID da Entidade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">Carregando logs...</TableCell>
                  </TableRow>
                ) : filteredLogs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">Nenhum log encontrado.</TableCell>
                  </TableRow>
                ) : filteredLogs?.map((log) => (
                  <TableRow key={log.id} className="group">
                    <TableCell className="text-xs font-mono">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{log.profiles?.display_name || "Sistema"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                        {log.entity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground font-mono">
                      {log.entity_id?.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Alteração</DialogTitle>
              <DialogDescription>
                Comparativo de dados para a entidade {selectedLog?.entity} ({selectedLog?.action})
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase">Dados Anteriores</h4>
                <pre className="p-4 bg-muted rounded-lg text-[10px] overflow-x-auto max-h-96">
                  {JSON.stringify(selectedLog?.old_data, null, 2) || "Nenhum dado anterior"}
                </pre>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-primary uppercase">Novos Dados</h4>
                <pre className="p-4 bg-primary/5 border border-primary/10 rounded-lg text-[10px] overflow-x-auto max-h-96">
                  {JSON.stringify(selectedLog?.new_data, null, 2) || "Nenhum dado novo"}
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
