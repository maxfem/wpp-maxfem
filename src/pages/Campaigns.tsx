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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Search, Megaphone, Zap, MoreVertical, Eye, Pencil, Copy, Trash2,
  Check, Clock, FileText, LayoutGrid, List, CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  draft: { label: "Rascunho", icon: FileText, className: "bg-muted text-muted-foreground" },
  sent: { label: "Enviado", icon: Check, className: "bg-green-100 text-green-700" },
  scheduled: { label: "Agendado", icon: Clock, className: "bg-yellow-100 text-yellow-700" },
  running: { label: "Em execução", icon: Zap, className: "bg-blue-100 text-blue-700" },
  finished: { label: "Encerrada", icon: Check, className: "bg-muted text-muted-foreground" },
};

const campaignTypes = [
  { value: "recovery", label: "Recuperação de Pedidos" },
  { value: "birthday", label: "Aniversariante do Dia" },
  { value: "birthday_month", label: "Aniversariante do Mês" },
  { value: "first_purchase_anniversary", label: "Aniversário da 1ª Compra" },
  { value: "post_sale", label: "Pós-venda" },
  { value: "custom", label: "Personalizada" },
];

const datePresets = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "Todos", days: -1 },
];

type CampaignActivity = { campaign_id: string; status: string; clicked_at: string | null; conversion_value: number | null; created_at: string };
type CampaignMetrics = { envios: number; cliques: number; conversao: number; conversoes: number };

export default function Campaigns() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", type: "custom" });
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [datePreset, setDatePreset] = useState(-1);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: rawActivities = [] } = useQuery<CampaignActivity[]>({
    queryKey: ["campaign-activities-raw", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("campaign_activities")
        .select("campaign_id, status, clicked_at, conversion_value, created_at")
        .eq("tenant_id", currentTenant.id);
      return (data as CampaignActivity[]) || [];
    },
    enabled: !!currentTenant,
  });

  const metricsMap = useMemo(() => {
    let acts = rawActivities;
    if (datePreset >= 0) {
      const from = startOfDay(subDays(new Date(), datePreset));
      const to = endOfDay(new Date());
      acts = acts.filter((a) => isWithinInterval(new Date(a.created_at), { start: from, end: to }));
    } else if (customDateFrom || customDateTo) {
      acts = acts.filter((a) => {
        const d = new Date(a.created_at);
        if (customDateFrom && d < startOfDay(customDateFrom)) return false;
        if (customDateTo && d > endOfDay(customDateTo)) return false;
        return true;
      });
    }
    const map: Record<string, CampaignMetrics> = {};
    acts.forEach((a) => {
      if (!map[a.campaign_id]) map[a.campaign_id] = { envios: 0, cliques: 0, conversao: 0, conversoes: 0 };
      map[a.campaign_id].envios++;
      if (a.clicked_at) map[a.campaign_id].cliques++;
      const cv = Number(a.conversion_value || 0);
      map[a.campaign_id].conversao += cv;
      if (cv > 0) map[a.campaign_id].conversoes++;
    });
    return map;
  }, [rawActivities, datePreset, customDateFrom, customDateTo]);

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await supabase.from("campaigns").insert({
        tenant_id: currentTenant.id,
        name: newCampaign.name,
        type: newCampaign.type,
        status: "draft",
      });
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

  const toggleCampaign = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const isActive = currentStatus === "scheduled" || currentStatus === "sent" || currentStatus === "running";
      const newStatus = isActive ? "draft" : "scheduled";
      const { error } = await supabase
        .from("campaigns")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let list = campaigns.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );

    // Date filter
    if (datePreset >= 0) {
      const from = startOfDay(subDays(new Date(), datePreset));
      const to = endOfDay(new Date());
      list = list.filter((c) => {
        const d = new Date(c.created_at);
        return isWithinInterval(d, { start: from, end: to });
      });
    } else if (customDateFrom || customDateTo) {
      list = list.filter((c) => {
        const d = new Date(c.created_at);
        if (customDateFrom && d < startOfDay(customDateFrom)) return false;
        if (customDateTo && d > endOfDay(customDateTo)) return false;
        return true;
      });
    }

    return list;
  }, [campaigns, search, datePreset, customDateFrom, customDateTo]);

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  const dateLabel = useMemo(() => {
    if (datePreset >= 0) {
      return datePresets.find((p) => p.days === datePreset)?.label || "";
    }
    if (customDateFrom && customDateTo) {
      return `${format(customDateFrom, "dd/MM", { locale: ptBR })} - ${format(customDateTo, "dd/MM", { locale: ptBR })}`;
    }
    if (customDateFrom) return `A partir de ${format(customDateFrom, "dd/MM", { locale: ptBR })}`;
    if (customDateTo) return `Até ${format(customDateTo, "dd/MM", { locale: ptBR })}`;
    return "Todos";
  }, [datePreset, customDateFrom, customDateTo]);

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
        <DropdownMenuItem><Copy className="h-4 w-4 mr-2" />Duplicar</DropdownMenuItem>
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

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar campanhas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Date presets */}
          <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
            {datePresets.map((p) => (
              <Button
                key={p.days}
                variant={datePreset === p.days && !customDateFrom && !customDateTo ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  setDatePreset(p.days);
                  setCustomDateFrom(undefined);
                  setCustomDateTo(undefined);
                }}
              >
                {p.label}
              </Button>
            ))}

            {/* Custom date picker */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={(customDateFrom || customDateTo) ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                >
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {customDateFrom || customDateTo ? dateLabel : "Período"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">De</p>
                  <Calendar
                    mode="single"
                    selected={customDateFrom}
                    onSelect={(d) => {
                      setCustomDateFrom(d);
                      setDatePreset(-1);
                    }}
                    className={cn("p-0 pointer-events-auto")}
                  />
                  <p className="text-xs font-medium text-muted-foreground">Até</p>
                  <Calendar
                    mode="single"
                    selected={customDateTo}
                    onSelect={(d) => {
                      setCustomDateTo(d);
                      setDatePreset(-1);
                      if (customDateFrom) setCalendarOpen(false);
                    }}
                    className={cn("p-0 pointer-events-auto")}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-border rounded-md p-0.5">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
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
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const st = statusConfig[c.status] || statusConfig.draft;
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
                      <Badge variant="outline" className={`text-[10px] gap-1 ${st.className}`}>
                        <StIcon className="h-3 w-3" />
                        {st.label}
                      </Badge>
                      <Switch
                        className="scale-75"
                        checked={c.status === "scheduled" || c.status === "sent" || c.status === "running"}
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Envios</TableHead>
                   <TableHead className="text-right">% Conversão</TableHead>
                   <TableHead className="text-right">Faturado</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ativo</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const st = statusConfig[c.status] || statusConfig.draft;
                  const StIcon = st.icon;
                  const typeLabel = campaignTypes.find((t) => t.value === c.type)?.label || c.type;
                  const metrics = metricsMap[c.id];

                  return (
                    <TableRow key={c.id} className="group">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{typeLabel}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${st.className}`}>
                          <StIcon className="h-3 w-3" />
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{metrics?.envios?.toLocaleString("pt-BR") || "—"}</TableCell>
                      <TableCell className="text-right text-xs">
                        {metrics && metrics.envios > 0
                          ? `${((metrics.conversoes / metrics.envios) * 100).toFixed(1)}%`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {metrics && metrics.conversao > 0
                          ? <span className="font-medium" style={{ color: "hsl(var(--chart-2))" }}>R$ {metrics.conversao >= 1000 ? `${(metrics.conversao / 1000).toFixed(1)}k` : metrics.conversao.toFixed(2)}</span>
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          className="scale-75"
                          checked={c.status === "scheduled" || c.status === "sent" || c.status === "running"}
                          onCheckedChange={() => toggleCampaign.mutate({ id: c.id, currentStatus: c.status })}
                        />
                      </TableCell>
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
