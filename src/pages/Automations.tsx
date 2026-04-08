import { useState } from "react";
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
import { Plus, Search, Megaphone, Zap, MoreVertical, Eye, Pencil, Copy, Trash2, Check, Clock, FileText, AlertTriangle, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { AutomationTemplatesList } from "@/components/automations/AutomationTemplatesList";

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

type CampaignMetrics = { envios: number; cliques: number; conversao: number };

export default function Automations() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", type: "custom" });

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

  const { data: metricsMap = {} } = useQuery<Record<string, CampaignMetrics>>({
    queryKey: ["automation-metrics", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return {};
      const { data } = await supabase
        .from("campaign_activities")
        .select("campaign_id, status, clicked_at, conversion_value")
        .eq("tenant_id", currentTenant.id);
      if (!data) return {};
      const map: Record<string, CampaignMetrics> = {};
      data.forEach((a) => {
        if (!map[a.campaign_id]) map[a.campaign_id] = { envios: 0, cliques: 0, conversao: 0 };
        map[a.campaign_id].envios++;
        if (a.clicked_at) map[a.campaign_id].cliques++;
        map[a.campaign_id].conversao += Number(a.conversion_value || 0);
      });
      return map;
    },
    enabled: !!currentTenant,
  });

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
      queryClient.invalidateQueries({ queryKey: ["automations"] });
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
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Campanha excluída");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Automações</h1>
            <p className="text-sm text-muted-foreground mt-1">{campaigns.length} automações</p>
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

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar campanhas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              const typeLabel = campaignTypes.find((t) => t.value === c.type)?.label || c.type;
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
                    <CardDescription className="text-xs">{typeLabel}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Metrics */}
                    {metrics && metrics.envios > 0 && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{metrics.envios.toLocaleString("pt-BR")} envios</span>
                        <span className="text-border">|</span>
                        <span>{metrics.envios > 0 ? ((metrics.cliques / metrics.envios) * 100).toFixed(1) : 0}% clique</span>
                        {metrics.conversao > 0 && (
                          <>
                            <span className="text-border">|</span>
                            <span className="text-green-600 font-medium">
                              R$ {metrics.conversao >= 1000 ? `${(metrics.conversao / 1000).toFixed(2)}k` : metrics.conversao.toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${st.className}`}>
                        <StIcon className="h-3 w-3" />
                        {st.label}
                      </Badge>
                      <Switch className="scale-75" />
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
              {createCampaign.isPending ? "Criando..." : "Criar Automação"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AutomationTemplatesList open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
    </AppLayout>
  );
}
