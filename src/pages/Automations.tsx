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
import { Plus, Search, Megaphone, Zap, MoreVertical, Eye, Pencil, Copy, Trash2, Clock, LayoutList, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { isWithinInterval } from "date-fns";
import { cn, formatSP, toSaoPaulo, getStandardPeriodRange, type DatePeriodKey } from "@/lib/utils";
import { AutomationTemplatesList } from "@/components/automations/AutomationTemplatesList";
import { AUTOMATION_TRIGGERS, getTriggerLabel } from "@/components/campaign-flow/FlowSidebar";
import { getStatusMeta, toneClass } from "@/lib/statusBadges";

const datePresets: { label: string; key: DatePeriodKey }[] = [
  { label: "Hoje", key: "today" },
  { label: "7 dias", key: "7d" },
  { label: "14 dias", key: "14d" },
  { label: "30 dias", key: "30d" },
  { label: "90 dias", key: "90d" },
  { label: "Todos", key: "all" },
];

const automationTypes = [
  { value: "recovery", label: "Recuperação de Pedidos" },
  { value: "birthday", label: "Aniversariante do Dia" },
  { value: "birthday_month", label: "Aniversariante do Mês" },
  { value: "first_purchase_anniversary", label: "Aniversário da 1ª Compra" },
  { value: "post_sale", label: "Pós-venda" },
  { value: "custom", label: "Personalizada" },
];

type CampaignActivity = { campaign_id: string; status: string; clicked_at: string | null; converted_at: string | null; conversion_value: number | null; created_at: string };
type CampaignMetrics = { envios: number; cliques: number; conversao: number; conversoes: number };

export default function Automations() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", type: "custom", trigger: "" });
  const [dateKey, setDateKey] = useState<DatePeriodKey>("today");
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
        .eq("kind", "automation")
        .order("status", { ascending: false }) // Prioritize 'running' (r) over 'draft' (d)
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
      const allData: CampaignActivity[] = [];
      let fromPage = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("campaign_activities")
          .select("campaign_id, status, clicked_at, converted_at, conversion_value, created_at")
          .eq("tenant_id", currentTenant.id)
          .range(fromPage, fromPage + batchSize - 1);
        
        if (error) {
          console.error("Error fetching activities:", error);
          break;
        }
        if (!data || data.length === 0) break;
        allData.push(...(data as CampaignActivity[]));
        if (data.length < batchSize) break;
        fromPage += batchSize;
      }
      return allData;
    },
    enabled: !!currentTenant,
  });

  const { data: pendingQueueCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["automation-queue-counts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return {};
      const { data } = await supabase
        .from("automation_queue")
        .select("campaign_id")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending");
      const counts: Record<string, number> = {};
      (data || []).forEach((item) => {
        if (item.campaign_id) {
          counts[item.campaign_id] = (counts[item.campaign_id] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: !!currentTenant,
  });

  const metricsMap = useMemo(() => {
    const { from, to } = getStandardPeriodRange(dateKey, { from: customDateFrom, to: customDateTo });
    const inPeriod = (d: string | null) =>
      !!d && isWithinInterval(toSaoPaulo(d), { start: from, end: to });

    const map: Record<string, CampaignMetrics> = {};
    const ensure = (id: string) => {
      if (!map[id]) map[id] = { envios: 0, cliques: 0, conversao: 0, conversoes: 0 };
      return map[id];
    };

    rawActivities.forEach((a) => {
      // Envios e cliques: contados pela data do disparo (created_at).
      if (inPeriod(a.created_at)) {
        const m = ensure(a.campaign_id);
        m.envios++;
        if (a.clicked_at) m.cliques++;
      }
      // Conversão e receita: contadas pela data da CONVERSÃO (converted_at),
      // não pela do disparo — a venda acontece dias depois do envio. Sem isso,
      // o filtro "Hoje" zerava a receita de automações como carrinho abandonado.
      if (inPeriod(a.converted_at)) {
        const m = ensure(a.campaign_id);
        m.conversao += Number(a.conversion_value || 0);
        m.conversoes++;
      }
    });
    return map;
  }, [rawActivities, dateKey, customDateFrom, customDateTo]);

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
        kind: "automation",
      } as any).select("id").single();
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

  const duplicateCampaign = useMutation({
    mutationFn: async (campaign: any) => {
      if (!currentTenant) throw new Error("No tenant");
      const { data, error } = await supabase.from("campaigns").insert({
        tenant_id: currentTenant.id,
        name: `${campaign.name} (cópia)`,
        type: campaign.type,
        status: "draft",
        trigger_type: campaign.trigger_type,
        kind: "automation",
        flow_data: campaign.flow_data,
        audience_rules: campaign.audience_rules,
        actions: campaign.actions,
        list_id: campaign.list_id,
      } as any).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação duplicada!");
      navigate(`/automations/flow/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleAutomation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const isActive = currentStatus === "running";
      const newStatus = isActive ? "draft" : "running";
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
    
    // We removed the campaign creation date filter to show all automations 
    // regardless of when they were created, but keeping metrics date-filtered
    return list;
  }, [campaigns, search]);

  const dateLabel = useMemo(() => {
    if (dateKey !== "custom" && dateKey !== "all") {
      return datePresets.find((p) => p.key === dateKey)?.label || "";
    }
    if (customDateFrom && customDateTo) {
      return `${formatSP(customDateFrom, "dd/MM")} - ${formatSP(customDateTo, "dd/MM")}`;
    }
    if (customDateFrom) return `A partir de ${formatSP(customDateFrom, "dd/MM")}`;
    if (customDateTo) return `Até ${formatSP(customDateTo, "dd/MM")}`;
    return "Todos";
  }, [dateKey, customDateFrom, customDateTo]);

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
                key={p.key}
                variant={dateKey === p.key && !customDateFrom ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => {
                  setDateKey(p.key);
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
                    onSelect={(d) => { setCustomDateFrom(d); setDateKey("custom"); }}
                    className={cn("p-2 pointer-events-auto")}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Até</p>
                  <Calendar
                    mode="single"
                    selected={customDateTo}
                    onSelect={(d) => { setCustomDateTo(d); setDateKey("custom"); setCalendarOpen(false); }}
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
              const st = getStatusMeta(c.status, "automation");
              const StIcon = st.icon;
              const typeLabel = c.trigger_type ? getTriggerLabel(c.trigger_type) : (automationTypes.find((t) => t.value === c.type)?.label || c.type);
              const metrics = metricsMap[c.id];
              const pendingCount = pendingQueueCounts[c.id] || 0;
              const isActive = c.status === "running";

              return (
                <Card
                  key={c.id}
                  className="border border-border hover:border-primary/40 hover:shadow-sm transition-all group cursor-pointer"
                  onClick={() => navigate(`/automations/${c.id}`)}
                >
                  <CardHeader className="pb-2 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isActive ? "bg-success animate-pulse" : "bg-muted-foreground/40")} />
                        <CardTitle className="text-sm font-semibold leading-tight truncate">{c.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => navigate(`/automations/${c.id}`)}><Eye className="h-4 w-4 mr-2" />Ver relatório</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/automations/flow/${c.id}`)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateCampaign.mutate(c)}><Copy className="h-4 w-4 mr-2" />Duplicar</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteCampaign.mutate(c.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardDescription className="text-xs flex items-center gap-1.5 text-muted-foreground">
                      <Zap className="h-3 w-3 text-primary shrink-0" />
                      <span className="truncate">{typeLabel}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/60">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Envios</p>
                        <p className="text-sm font-semibold tabular-nums">{(metrics?.envios || 0).toLocaleString("pt-BR")}</p>
                      </div>
                      <div className="text-center border-x border-border/60">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Conv.</p>
                        <p className="text-sm font-semibold tabular-nums">{metrics && metrics.envios > 0 ? ((metrics.conversoes / metrics.envios) * 100).toFixed(1) : "0.0"}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Receita</p>
                        <p className="text-sm font-semibold tabular-nums text-success">
                          R$ {(metrics?.conversao || 0) >= 1000 ? `${((metrics?.conversao || 0) / 1000).toFixed(1)}k` : (metrics?.conversao || 0).toFixed(0)}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px] gap-1 font-medium px-1.5 py-0.5", toneClass(st.tone))}>
                          <StIcon className="h-2.5 w-2.5" />
                          {st.label}
                        </Badge>
                        {pendingCount > 0 && (
                          <Badge variant="outline" className={cn("text-[10px] gap-1 px-1.5 py-0.5", toneClass("warning"))}>
                            <Clock className="h-2.5 w-2.5" />
                            {pendingCount}
                          </Badge>
                        )}
                      </div>
                      <Switch
                        className="scale-75 -mr-1"
                        checked={isActive}
                        onClick={(e) => e.stopPropagation()}
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
                        <SelectItem key={item.value} value={item.value} disabled={item.enabled === false}>
                          {item.label}{item.enabled === false ? " (em breve)" : ""}
                        </SelectItem>
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
