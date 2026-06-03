import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Search, Megaphone, Zap, MoreVertical, Eye, Pencil, Copy, Trash2,
  Check, Clock, FileText, LayoutGrid, List, CalendarIcon, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getStatusMeta, toneClass } from "@/lib/statusBadges";
import { StatusTabs, bucketOf, type StatusBucket } from "@/components/campaigns/StatusTabs";
import { ViewSettings, loadViewSettings, type ColumnDef, type ViewMode } from "@/components/campaigns/ViewSettings";

const campaignTypes = [
  { value: "recovery", label: "Recuperação de Pedidos" },
  { value: "birthday", label: "Aniversariante do Dia" },
  { value: "birthday_month", label: "Aniversariante do Mês" },
  { value: "first_purchase_anniversary", label: "Aniversário da 1ª Compra" },
  { value: "post_sale", label: "Pós-venda" },
  { value: "custom", label: "Personalizada" },
];

const COLUMN_DEFS: ColumnDef[] = [
  { key: "name", label: "Nome", required: true },
  { key: "type", label: "Tipo", default: true },
  { key: "status", label: "Status", default: true },
  { key: "envios", label: "Envios", default: true },
  { key: "conversao_pct", label: "% Conversão", default: true },
  { key: "faturado", label: "Faturado", default: true },
  { key: "created_at", label: "Criado em", default: true },
  { key: "scheduled_at", label: "Agendado pra", default: false },
  { key: "ativo", label: "Switch ativo", default: true },
];

type CampaignMetrics = { envios: number; cliques: number; conversao: number; conversoes: number };

const initialView = loadViewSettings("campaigns:view", "grid", COLUMN_DEFS);

export default function Campaigns() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", type: "custom" });
  const [viewMode, setViewMode] = useState<ViewMode>(initialView.mode);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(initialView.cols);
  const [statusBucket, setStatusBucket] = useState<StatusBucket>("all");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("kind", "campaign")
        .order("status", { ascending: false }) // Prioritize active statuses alphabetically (scheduled, sent, etc. vs draft)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  // Métricas SEMPRE no acumulado total — agregadas no backend via RPC
  const { data: rawMetrics = [] } = useQuery<{ campaign_id: string; envios: number; cliques: number; conversoes: number; valor_conversao: number }[]>({
    queryKey: ["campaign-metrics-rpc", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase.rpc("rpc_campaign_metrics_summary", { p_tenant: currentTenant.id });
      if (error) throw error;
      return data as any;
    },
    enabled: !!currentTenant,
    staleTime: 5 * 60 * 1000,
  });

  const metricsMap = useMemo(() => {
    const map: Record<string, CampaignMetrics> = {};
    rawMetrics.forEach((m) => {
      map[m.campaign_id] = {
        envios: Number(m.envios || 0),
        cliques: Number(m.cliques || 0),
        conversoes: Number(m.conversoes || 0),
        conversao: Number(m.valor_conversao || 0),
      };
    });
    return map;
  }, [rawMetrics]);

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await supabase.from("campaigns").insert({
        tenant_id: currentTenant.id,
        name: newCampaign.name,
        type: newCampaign.type,
        status: "draft",
        kind: "campaign",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setDialogOpen(false);
      setNewCampaign({ name: "", type: "custom" });
      toast.success("Campanha criada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha excluída");
    },
    onError: (e) => toast.error(e.message),
  });

  const duplicateCampaign = useMutation({
    mutationFn: async (campaign: typeof campaigns[0]) => {
      const { id, created_at, updated_at, ...rest } = campaign;
      const { error } = await supabase.from("campaigns").insert({
        ...rest,
        name: `${campaign.name} (cópia)`,
        status: "draft",
        scheduled_at: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha duplicada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleCampaign = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const isActive = currentStatus === "scheduled" || currentStatus === "sending" || currentStatus === "sent" || currentStatus === "running";
      const newStatus = isActive ? "draft" : "scheduled";
      const { error } = await supabase
        .from("campaigns")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Status atualizado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let list = campaigns.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );
    if (statusBucket !== "all") {
      list = list.filter((c) => bucketOf(c.status) === statusBucket);
    }
    return list;
  }, [campaigns, search, statusBucket]);

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  const showCol = (k: string) => visibleColumns.includes(k);

  const renderCampaignActions = (c: typeof campaigns[0]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(`/campaigns/${c.id}`)}><Eye className="h-4 w-4 mr-2" />Ver relatório</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/campaigns/flow/${c.id}`)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicateCampaign.mutate(c)}><Copy className="h-4 w-4 mr-2" />Duplicar</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => deleteCampaign.mutate(c.id)}>
          <Trash2 className="h-4 w-4 mr-2" />Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campanhas</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} de {campaigns.length} campanhas</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Criar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                <Megaphone className="h-4 w-4 mr-2" />
                Modo padrão
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/campaigns/flow/new")}>
                <Zap className="h-4 w-4 mr-2" />
                Modo avançado
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status tabs + visualização */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusTabs items={campaigns} value={statusBucket} onChange={setStatusBucket} />
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            <ViewSettings
              storageKey="campaigns:view"
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              columns={COLUMN_DEFS}
              visibleColumns={visibleColumns}
              onVisibleColumnsChange={setVisibleColumns}
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground mb-1">Nenhuma campanha</p>
              <p className="text-sm text-muted-foreground">Crie sua primeira campanha para engajar seus clientes.</p>
            </CardContent>
          </Card>
        ) : viewMode === "compact" ? (
          <Card className="border border-border divide-y divide-border">
            {filtered.map((c) => {
              const st = getStatusMeta(c.status, "campaign");
              const StIcon = st.icon;
              const metrics = metricsMap[c.id];
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group">
                  <Badge variant="outline" className={cn("text-[10px] gap-1 shrink-0", toneClass(st.tone))}>
                    <StIcon className="h-3 w-3" />{st.label}
                  </Badge>
                  <button
                    className="font-medium text-sm flex-1 text-left hover:text-primary truncate"
                    onClick={() => navigate(`/campaigns/${c.id}`)}
                  >
                    {c.name}
                  </button>
                  {showCol("envios") && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {(metrics?.envios || 0).toLocaleString("pt-BR")} envios
                    </span>
                  )}
                  {showCol("faturado") && (metrics?.conversao || 0) > 0 && (
                    <span className="text-xs font-medium tabular-nums shrink-0" style={{ color: "hsl(var(--chart-2))" }}>
                      R$ {metrics.conversao >= 1000 ? `${(metrics.conversao / 1000).toFixed(1)}k` : metrics.conversao.toFixed(2)}
                    </span>
                  )}
                  {showCol("ativo") && (
                    <Switch
                      className="scale-75 shrink-0"
                      checked={c.status === "scheduled" || c.status === "sending" || c.status === "sent" || c.status === "running"}
                      onCheckedChange={() => toggleCampaign.mutate({ id: c.id, currentStatus: c.status })}
                    />
                  )}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {renderCampaignActions(c)}
                  </div>
                </div>
              );
            })}
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const st = getStatusMeta(c.status, "campaign");
              const StIcon = st.icon;
              const typeLabel = campaignTypes.find((t) => t.value === c.type)?.label || c.type;
              const metrics = metricsMap[c.id];

              return (
                <Card key={c.id} className="border border-border hover:border-primary/30 transition-colors group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold leading-tight pr-6 cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.name}</CardTitle>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {renderCampaignActions(c)}
                      </div>
                    </div>
                    <CardDescription className="text-xs">{typeLabel} · {formatDate(c.created_at)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{(metrics?.envios || 0).toLocaleString("pt-BR")} envios</span>
                      <span className="text-border">|</span>
                      <span>{metrics && metrics.envios > 0 ? ((metrics.conversoes / metrics.envios) * 100).toFixed(1) : "0.0"}% conversão</span>
                      <span className="text-border">|</span>
                      <span className="font-medium" style={{ color: "hsl(var(--chart-2))" }}>
                        R$ {(metrics?.conversao || 0) >= 1000 ? `${((metrics?.conversao || 0) / 1000).toFixed(1)}k` : (metrics?.conversao || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <Badge variant="outline" className={cn("text-[10px] gap-1", toneClass(st.tone))}>
                        <StIcon className="h-3 w-3" />
                        {st.label}
                      </Badge>
                      <Switch
                        className="scale-75"
                        aria-label={`Ativar campanha ${c.name}`}
                        checked={c.status === "scheduled" || c.status === "sending" || c.status === "sent" || c.status === "running"}
                        onCheckedChange={() => toggleCampaign.mutate({ id: c.id, currentStatus: c.status })}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* List view */
          <Card className="border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  {showCol("type") && <TableHead>Tipo</TableHead>}
                  {showCol("status") && <TableHead>Status</TableHead>}
                  {showCol("envios") && <TableHead className="text-right">Envios</TableHead>}
                  {showCol("conversao_pct") && <TableHead className="text-right">% Conversão</TableHead>}
                  {showCol("faturado") && <TableHead className="text-right">Faturado</TableHead>}
                  {showCol("created_at") && <TableHead>Criado em</TableHead>}
                  {showCol("scheduled_at") && <TableHead>Agendado pra</TableHead>}
                  {showCol("ativo") && <TableHead className="text-right">Ativo</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const st = getStatusMeta(c.status, "campaign");
                  const StIcon = st.icon;
                  const typeLabel = campaignTypes.find((t) => t.value === c.type)?.label || c.type;
                  const metrics = metricsMap[c.id];

                  return (
                    <TableRow key={c.id} className="group">
                      <TableCell className="font-medium">
                        <button onClick={() => navigate(`/campaigns/${c.id}`)} className="hover:text-primary text-left">
                          {c.name}
                        </button>
                      </TableCell>
                      {showCol("type") && <TableCell className="text-muted-foreground text-xs">{typeLabel}</TableCell>}
                      {showCol("status") && (
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] gap-1", toneClass(st.tone))}>
                            <StIcon className="h-3 w-3" />
                            {st.label}
                          </Badge>
                        </TableCell>
                      )}
                      {showCol("envios") && <TableCell className="text-right text-xs">{metrics?.envios?.toLocaleString("pt-BR") || "—"}</TableCell>}
                      {showCol("conversao_pct") && (
                        <TableCell className="text-right text-xs">
                          {metrics && metrics.envios > 0
                            ? `${((metrics.conversoes / metrics.envios) * 100).toFixed(1)}%`
                            : "—"}
                        </TableCell>
                      )}
                      {showCol("faturado") && (
                        <TableCell className="text-right text-xs">
                          {metrics && metrics.conversao > 0
                            ? <span className="font-medium" style={{ color: "hsl(var(--chart-2))" }}>R$ {metrics.conversao >= 1000 ? `${(metrics.conversao / 1000).toFixed(1)}k` : metrics.conversao.toFixed(2)}</span>
                            : "—"}
                        </TableCell>
                      )}
                      {showCol("created_at") && <TableCell className="text-xs text-muted-foreground">{formatDate(c.created_at)}</TableCell>}
                      {showCol("scheduled_at") && <TableCell className="text-xs text-muted-foreground">{formatDate((c as any).scheduled_at)}</TableCell>}
                      {showCol("ativo") && (
                        <TableCell className="text-right">
                          <Switch
                            className="scale-75"
                            aria-label={`Ativar campanha ${c.name}`}
                            checked={c.status === "scheduled" || c.status === "sending" || c.status === "sent" || c.status === "running"}
                            onCheckedChange={() => toggleCampaign.mutate({ id: c.id, currentStatus: c.status })}
                          />
                        </TableCell>
                      )}
                      <TableCell>{renderCampaignActions(c)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Modal modo padrão */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Campanha</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); createCampaign.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome da Campanha *</Label>
              <Input
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="Ex: Promoção Black Friday"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newCampaign.type} onValueChange={(v) => setNewCampaign({ ...newCampaign, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {campaignTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? "Criando..." : "Criar Campanha"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
