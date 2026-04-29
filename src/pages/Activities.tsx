import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { 
  Activity, 
  MessageSquare, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Eye, 
  MousePointerClick,
  TrendingUp,
  User,
  Search,
  XCircle
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatSP, localeSP } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  sent: { label: "Enviado", icon: Clock, color: "bg-blue-100 text-blue-700" },
  delivered: { label: "Entregue", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  read: { label: "Lido", icon: Eye, color: "bg-cyan-100 text-cyan-700" },
  clicked: { label: "Clicado", icon: MousePointerClick, color: "bg-amber-100 text-amber-700" },
  converted: { label: "Convertido", icon: TrendingUp, color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Falhou", icon: AlertCircle, color: "bg-red-100 text-red-700" },
  complained: { label: "Denúncia", icon: AlertCircle, color: "bg-orange-100 text-orange-700" },
};

export default function Activities() {
  const { currentTenant } = useAuth();
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const { data: activities, isLoading } = useQuery({
    queryKey: ["all-activities", currentTenant?.id, channelFilter, statusFilter, searchFilter],
    queryFn: async () => {
      if (!currentTenant) return [];
      
      let query = supabase
        .from("campaign_activities")
        .select(`
          *,
          customers(name, phone, email),
          campaigns(name)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (channelFilter !== "all") {
        query = query.eq("channel", channelFilter);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Note: Search filter on joined tables (customers) is tricky with PostgREST 
      // simple filters, but we can filter the results if needed, or use a more complex query.
      // For now, let's keep it simple and filter by status and channel.
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      let filteredData = data || [];
      
      if (searchFilter) {
        const lowerSearch = searchFilter.toLowerCase();
        filteredData = filteredData.filter((a: any) => 
          a.customers?.name?.toLowerCase().includes(lowerSearch) ||
          a.customers?.email?.toLowerCase().includes(lowerSearch) ||
          a.customers?.phone?.toLowerCase().includes(lowerSearch) ||
          a.campaigns?.name?.toLowerCase().includes(lowerSearch)
        );
      }

      return filteredData;
    },
    enabled: !!currentTenant,
  });

  const clearFilters = () => {
    setChannelFilter("all");
    setStatusFilter("all");
    setSearchFilter("");
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Atividades</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Log de execuções e interações em tempo real
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border shadow-sm">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground ml-1">Buscar cliente ou campanha</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: João, Promoção..."
                className="pl-9"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5 w-[180px]">
            <label className="text-xs font-medium text-muted-foreground ml-1">Canal</label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os canais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 w-[180px]">
            <label className="text-xs font-medium text-muted-foreground ml-1">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(channelFilter !== "all" || statusFilter !== "all" || searchFilter !== "") && (
            <Button 
              variant="ghost" 
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-sm text-muted-foreground mt-4">Carregando histórico...</p>
              </div>
            ) : !activities || activities.length === 0 ? (
              <div className="p-12 text-center">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground mb-1">Sem atividades</p>
                <p className="text-sm text-muted-foreground">
                  As execuções das suas campanhas e automações aparecerão aqui.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Campanha / Automação</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Última Atualização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((a: any) => {
                    const status = statusConfig[a.status] || { label: a.status, icon: Clock, color: "bg-muted" };
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{a.customers?.name || "Desconhecido"}</span>
                              <span className="text-xs text-muted-foreground">{a.customers?.phone || a.customers?.email || "—"}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{a.campaigns?.name || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {a.channel === "whatsapp" ? (
                              <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100 gap-1">
                                <MessageSquare className="h-3 w-3" /> WhatsApp
                              </Badge>
                            ) : a.channel === "email" ? (
                              <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-100 gap-1">
                                <Mail className="h-3 w-3" /> E-mail
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{a.channel}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`gap-1 ${status.color}`} variant="secondary">
                            <status.icon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{localeSP(a.sent_at || a.created_at)}</span>
                            {a.error_message && (
                              <span className="text-[10px] text-destructive truncate max-w-[150px]" title={a.error_message}>
                                {a.error_message}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

