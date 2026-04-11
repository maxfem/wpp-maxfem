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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Megaphone, Zap, MoreVertical, Eye, Pencil, Copy, Trash2, Check, Clock, FileText, AlertTriangle, LayoutList, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AutomationTemplatesList } from "@/components/automations/AutomationTemplatesList";
import { AUTOMATION_TRIGGERS, getTriggerLabel } from "@/components/campaign-flow/FlowSidebar";

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  draft: { label: "Rascunho", icon: FileText, className: "bg-muted text-muted-foreground" },
  sent: { label: "Enviado", icon: Check, className: "bg-green-100 text-green-700" },
  scheduled: { label: "Agendado", icon: Clock, className: "bg-yellow-100 text-yellow-700" },
  running: { label: "Em execução", icon: Zap, className: "bg-blue-100 text-blue-700" },
  failed: { label: "Falhou", icon: AlertTriangle, className: "bg-destructive/10 text-destructive" },
  finished: { label: "Encerrada", icon: Check, className: "bg-muted text-muted-foreground" },
};

const datePresets = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "Todos", days: -1 },
];

const automationTypes = [
  { value: "recovery", label: "Recuperação de Pedidos" },
  { value: "birthday", label: "Aniversariante do Dia" },
  { value: "birthday_month", label: "Aniversariante do Mês" },
  { value: "first_purchase_anniversary", label: "Aniversário da 1ª Compra" },
  { value: "post_sale", label: "Pós-venda" },
  { value: "custom", label: "Personalizada" },
];

type CampaignActivity = { campaign_id: string; status: string; clicked_at: string | null; conversion_value: number | null; created_at: string };
type CampaignMetrics = { envios: number; cliques: number; conversao: number; conversoes: number };

export default function Automations() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", type: "custom", trigger: "" });
  const [datePreset, setDatePreset] = useState(-1);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["automations", currentTenant?.id],
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
    queryKey: ["automation-activities-raw", currentTenant?.id],
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
      if (!newCampaign.trigger) throw new Error("Selecione um gatilho");
      const { data, error } = await supabase.from("campaigns").insert({
        tenant_id: currentTenant.id,
        name: newCampaign.name,
        type: newCampaign.type,
        status: "draft",
        trigger_type: newCampaign.trigger,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setDialogOpen(false);
      setNewCampaign({ name: "", type: "custom", trigger: "" });
      toast.success("Automação criada!");
      navigate(`/automations/flow/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Campanha excluída");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleAutomation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Status atualizado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let list = campaigns.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );
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

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Automações</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} de {campaigns.length} automações</p>
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
              <DropdownMenuItem onClick={() => navigate("/automations/flow/new")}>
                <Zap className="h-4 w-4 mr-2" />
                Modo avançado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTemplatesOpen(true)}>
                <LayoutList className="h-4 w-4 mr-2" />
                Réguas prontas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar automações..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
            {datePresets.map((p) => (
              <Button
                key={p.days}
                variant={datePreset === p.days && !customDateFrom ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => {
                  setDatePreset(p.days);
                  setCustomDateFrom(undefined);
                  setCustomDateTo(undefined);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", customDateFrom && "border-primary")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {customDateFrom ? dateLabel : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex gap-2 p-3">
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">De</p>
                  <Calendar
                    mode="single"
                    selected={customDateFrom}
                    onSelect={(d) => { setCustomDateFrom(d); setDatePreset(-1); }}
                    className={cn("p-2 pointer-events-auto")}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Até</p>
                  <Calendar
                    mode="single"
                    selected={customDateTo}
                    onSelect={(d) => { setCustomDateTo(d); setDatePreset(-1); setCalendarOpen(false); }}
                    className={cn("p-2 pointer-events-auto")}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Grid */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground mb-1">Nenhuma automação</p>
              <p className="text-sm text-muted-foreground">Crie sua primeira automação para engajar seus clientes.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const st = statusConfig[c.status] || statusConfig.draft;
              const StIcon = st.icon;
              const typeLabel = c.trigger_type ? getTriggerLabel(c.trigger_type) : (automationTypes.find((t) => t.value === c.type)?.label || c.type);
              const metrics = metricsMap[c.id];

              return (
                <Card key={c.id} className="border border-border hover:border-primary/30 transition-colors group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold leading-tight pr-6">{c.name}</CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Eye className="h-4 w-4 mr-2" />Ver relatório</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/automations/flow/${c.id}`)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                          <DropdownMenuItem><Copy className="h-4 w-4 mr-2" />Duplicar</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteCampaign.mutate(c.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardDescription className="text-xs flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" />
                      {typeLabel}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Metrics */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{(metrics?.envios || 0).toLocaleString("pt-BR")} envios</span>
                      <span className="text-border">|</span>
                      <span>{metrics && metrics.envios > 0 ? ((metrics.conversoes / metrics.envios) * 100).toFixed(1) : "0.0"}% conversão</span>
                      <span className="text-border">|</span>
                      <span className="font-medium" style={{ color: "hsl(var(--chart-2))" }}>
                        R$ {(metrics?.conversao || 0) >= 1000 ? `${((metrics?.conversao || 0) / 1000).toFixed(1)}k` : (metrics?.conversao || 0).toFixed(2)}
                      </span>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${st.className}`}>
                        <StIcon className="h-3 w-3" />
                        {st.label}
                      </Badge>
                      <Switch
                        className="scale-75"
                        checked={c.status === "scheduled" || c.status === "sent" || c.status === "running"}
                        onCheckedChange={() => toggleAutomation.mutate({ id: c.id, currentStatus: c.status })}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal modo padrão */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Automação</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); createCampaign.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome da Automação *</Label>
              <Input
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="Ex: Recuperação de Carrinho"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Gatilho *</Label>
              <Select value={newCampaign.trigger} onValueChange={(v) => setNewCampaign({ ...newCampaign, trigger: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar gatilho" /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGERS.map((group) => (
                    <div key={group.group}>
                      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.group}
                      </div>
                      {group.items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {newCampaign.trigger && (
                <p className="text-xs text-muted-foreground">
                  ⚡ {AUTOMATION_TRIGGERS.flatMap(g => g.items).find(i => i.value === newCampaign.trigger)?.description}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newCampaign.type} onValueChange={(v) => setNewCampaign({ ...newCampaign, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {automationTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={createCampaign.isPending || !newCampaign.trigger}>
              {createCampaign.isPending ? "Criando..." : "Criar Automação"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AutomationTemplatesList open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
    </AppLayout>
  );
}
