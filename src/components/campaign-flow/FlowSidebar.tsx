import { NODE_PALETTE } from "./nodeTypes";
import {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, LogOut, StickyNote, Zap,
  Lock, CalendarIcon, BrainCircuit, Split, FlaskConical
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatSP } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

const iconMap: Record<string, React.ElementType> = {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, TagX: Tag, LogOut, StickyNote, Zap,
};

const groupLabels: Record<string, string> = {
  action: "Ação",
  logic: "Lógico",
  time: "Tempo",
  chat: "Chat",
  advanced: "Avançado",
  extra: "Extra",
};

type IntegrationTag = "yampi" | "bling" | "pixel" | "whatsapp" | "crm";
type TriggerItem = {
  value: string;
  label: string;
  description: string;
  enabled?: boolean;
  integration?: IntegrationTag;
};
type TriggerGroup = { group: string; items: TriggerItem[] };

export const AUTOMATION_TRIGGERS: TriggerGroup[] = [
  // ─── GERAL (sem integração externa, funciona com dados do CRM) ───
  { group: "Geral · CRM", items: [
    { value: "birthday", label: "Aniversário do cliente", description: "Disparado todo dia no aniversário do cliente (usa data cadastrada no customer)", enabled: true, integration: "crm" },
    { value: "inactivity", label: "Inatividade", description: "Cliente sem comprar há X dias (defina X no nome da automation: ex. \"60 dias\")", enabled: true, integration: "crm" },
    { value: "lead_created", label: "Lead inserido na lista", description: "Disparado quando um cliente é adicionado a uma contact_list", enabled: true, integration: "crm" },
    { value: "webhook", label: "Webhook customizado", description: "Endpoint público que aceita POST e dispara a automation. URL exposta após salvar.", enabled: true, integration: "crm" },
  ]},

  // ─── ATENDIMENTO WhatsApp ───
  { group: "Atendimento · WhatsApp", items: [
    { value: "conversation_created", label: "Nova conversa WhatsApp", description: "Primeira mensagem inbound de um número (cliente novo via Meta WhatsApp)", enabled: true, integration: "whatsapp" },
    { value: "conversation_archived", label: "Conversa arquivada", description: "Atendimento marcado como resolvido (ticket_status = resolved)", enabled: true, integration: "whatsapp" },
  ]},

  // ─── E-COMMERCE: pedidos da loja (origem Yampi) ───
  { group: "Pedidos · Yampi (Loja)", items: [
    { value: "order_created", label: "Pedido criado", description: "Novo pedido (qualquer método de pagamento)", enabled: true, integration: "yampi" },
    { value: "order_created_pix", label: "Pedido criado (Pix)", description: "Pedido aguardando pagamento Pix", enabled: true, integration: "yampi" },
    { value: "order_created_boleto", label: "Pedido criado (Boleto)", description: "Pedido aguardando pagamento de boleto", enabled: true, integration: "yampi" },
    { value: "order_paid", label: "Pedido pago", description: "Pagamento confirmado pela Yampi/gateway", enabled: true, integration: "yampi" },
    { value: "order_rejected_card", label: "Pedido recusado (Cartão)", description: "Pagamento de cartão recusado/cancelado", enabled: true, integration: "yampi" },
    { value: "first_purchase", label: "Primeira compra", description: "Cliente concluiu sua primeira compra (total_orders = 1)", enabled: true, integration: "yampi" },
    { value: "cart_abandoned", label: "Carrinho abandonado", description: "Carrinho registrado pela Yampi sem conversão em pedido", enabled: true, integration: "yampi" },
  ]},

  // ─── FISCAL & LOGÍSTICA: status pós-pagamento (Bling cobre fiscal + tracking; Yampi corrobora) ───
  { group: "Fiscal & Logística · Bling/Yampi", items: [
    { value: "order_approved", label: "Pedido aprovado", description: "Pedido aprovado/faturado pelo lojista (Bling + Yampi)", enabled: true, integration: "bling" },
    { value: "invoice_issued", label: "Nota fiscal emitida", description: "NF-e emitida pelo Bling (ou status invoiced na Yampi)", enabled: true, integration: "bling" },
    { value: "tracking_created", label: "Rastreio gerado", description: "Bling/Yampi gerou o primeiro código de rastreio do pedido", enabled: true, integration: "bling" },
    { value: "tracking_updated", label: "Rastreio atualizado", description: "Status do rastreio mudou (postado, em trânsito, saiu para entrega)", enabled: true, integration: "bling" },
    { value: "order_delivered", label: "Pedido entregue", description: "Status do pedido alterado para entregue (Bling/Yampi)", enabled: true, integration: "bling" },
    { value: "return_approved", label: "Devolução aprovada", description: "Devolução, troca ou estorno aprovado", enabled: true, integration: "bling" },
  ]},

  // ─── COMPORTAMENTO NO SITE (Pixel próprio) ───
  { group: "Comportamento · Pixel", items: [
    { value: "cart_abandonment_pixel", label: "Checkout abandonado (Pixel)", description: "Cliente identificado iniciou checkout no site e não converteu", enabled: true, integration: "pixel" },
    { value: "browse_abandonment", label: "Navegação abandonada (Pixel)", description: "Cliente identificado viu produtos mas não comprou", enabled: true, integration: "pixel" },
  ]},

  // ─── PÓS-VENDA & RETENÇÃO ───
  { group: "Pós-venda & Retenção", items: [
    { value: "first_purchase_anniversary", label: "Aniversário da 1ª compra", description: "Disparado anualmente na data da primeira compra do cliente", enabled: true, integration: "yampi" },
    { value: "pos_delivery_7d", label: "7 dias após entrega", description: "Pós-venda 7 dias após o pedido ser entregue", enabled: true, integration: "yampi" },
  ]},
];

// Cores/labels das tags de integração — usadas em badges visuais opcionais
export const INTEGRATION_META: Record<IntegrationTag, { label: string; color: string }> = {
  yampi:    { label: "Yampi",    color: "bg-pink-100 text-pink-700 border-pink-200" },
  bling:    { label: "Bling",    color: "bg-amber-100 text-amber-700 border-amber-200" },
  pixel:    { label: "Pixel",    color: "bg-violet-100 text-violet-700 border-violet-200" },
  whatsapp: { label: "WhatsApp", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  crm:      { label: "CRM",      color: "bg-slate-100 text-slate-700 border-slate-200" },
};

export function getTriggerLabel(value: string): string {
  for (const group of AUTOMATION_TRIGGERS) {
    const item = group.items.find((i) => i.value === value);
    if (item) return item.label;
  }
  return value || "Selecionar gatilho";
}

interface FlowSidebarProps {
  campaignName: string;
  onNameChange: (name: string) => void;
  selectedListId?: string;
  onListChange?: (listId: string) => void;
  scheduledDate?: string;
  onScheduledDateChange?: (date: string) => void;
  scheduledTime?: string;
  onScheduledTimeChange?: (time: string) => void;
  isAutomation?: boolean;
  selectedTrigger?: string;
  onTriggerChange?: (trigger: string) => void;
  selectedWhatsAppAccountId?: string;
  onWhatsAppAccountChange?: (id: string) => void;
  stoEnabled?: boolean;
  onStoChange?: (enabled: boolean) => void;
  isAbTest?: boolean;
  onAbTestChange?: (enabled: boolean) => void;
  isSandbox?: boolean;
  onSandboxChange?: (enabled: boolean) => void;
}

export function FlowSidebar({
  campaignName, onNameChange, selectedListId, onListChange,
  scheduledDate, onScheduledDateChange, scheduledTime, onScheduledTimeChange,
  isAutomation, selectedTrigger, onTriggerChange,
  selectedWhatsAppAccountId, onWhatsAppAccountChange,
  stoEnabled, onStoChange, isAbTest, onAbTestChange,
  isSandbox, onSandboxChange,
}: FlowSidebarProps) {
  const { currentTenant } = useAuth();

  const { data: lists = [] } = useQuery({
    queryKey: ["contact_lists", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("contact_lists")
        .select("id, name, customer_count")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: whatsappAccounts = [] } = useQuery({
    queryKey: ["whatsapp_accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("id, display_phone, verified_name, phone_number_id")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  // Quais integrações estão ativas no tenant — usado pra mostrar warning quando
  // o usuário seleciona um trigger cuja integração está inativa.
  const { data: activeIntegrations = new Set<string>() } = useQuery({
    queryKey: ["active-integrations", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return new Set<string>();
      const { data, error } = await supabase
        .from("integrations")
        .select("provider")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (error) throw error;
      const providers = new Set<string>((data || []).map((r: { provider: string }) => r.provider));
      // CRM e WhatsApp são "infra base" — sempre considerados ativos.
      providers.add("crm");
      if (whatsappAccounts.length > 0) providers.add("whatsapp");
      // Pixel: considerado ativo se houver pelo menos 1 pixel_event nos últimos 30d
      // (verificação lazy — pra evitar query extra, assumimos ativo se houver integração ou pixel registrado).
      return providers;
    },
    enabled: !!currentTenant,
  });

  const selectedTriggerMeta = AUTOMATION_TRIGGERS.flatMap(g => g.items).find(i => i.value === selectedTrigger);
  const selectedTriggerIntegration = selectedTriggerMeta?.integration;
  const integrationInactive = selectedTriggerIntegration
    && selectedTriggerIntegration !== "crm"
    && !activeIntegrations.has(selectedTriggerIntegration);

  const onDragStart = (event: React.DragEvent, nodeData: { type: string; label: string; icon: string; color: string }) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-[260px] border-r border-border bg-background flex flex-col h-full overflow-hidden">
      {/* Configuration Section */}
      <div className="p-3 border-b border-border space-y-3 bg-muted/20">
        <div className="space-y-1">
          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Nome</Label>
          <Input
            value={campaignName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={isAutomation ? "Nome da automação" : "Nome da campanha"}
            className="h-7 text-xs border-transparent hover:border-border focus:border-primary/50 bg-transparent transition-all px-1.5 focus:bg-background"
          />
        </div>

        {isAutomation ? (
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-primary uppercase tracking-wider px-0.5">Gatilho</Label>
            <Select value={selectedTrigger || ""} onValueChange={(v) => onTriggerChange?.(v)}>
              <SelectTrigger className="h-7 text-xs border-transparent hover:border-border focus:border-primary/50 bg-transparent transition-all px-1.5 focus:bg-background">
                <SelectValue placeholder="Selecionar gatilho" />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_TRIGGERS.map((group) => (
                  <div key={group.group}>
                    <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">
                      {group.group}
                    </div>
                    {group.items.map((item) => {
                      const meta = item.integration ? INTEGRATION_META[item.integration] : null;
                      return (
                        <SelectItem key={item.value} value={item.value} disabled={item.enabled === false} className="text-xs">
                          <div className="flex items-center justify-between gap-2 py-0.5 w-full">
                            <span className="truncate">{item.label}</span>
                            <span className="flex items-center gap-1 shrink-0">
                              {meta && (
                                <span className={cn("text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", meta.color)}>
                                  {meta.label}
                                </span>
                              )}
                              {item.enabled === false && <Lock className="h-3 w-3 text-muted-foreground/50" />}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </div>
                ))}
              </SelectContent>
            </Select>
            {selectedTrigger && (
              <p className="text-[10px] text-muted-foreground/80 leading-snug px-1 pt-1 italic">
                {selectedTriggerMeta?.description}
              </p>
            )}
            {integrationInactive && selectedTriggerIntegration && (
              <div className="mt-2 mx-1 p-2 rounded-md border border-destructive/30 bg-destructive/5 text-[11px] leading-snug text-destructive flex items-start gap-2">
                <svg className="h-3.5 w-3.5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <strong className="font-semibold">
                    {INTEGRATION_META[selectedTriggerIntegration].label} não está conectada.
                  </strong>{" "}
                  Este gatilho não vai disparar até a integração ser ativada em <a href="/settings/integrations" className="underline font-medium">Configurações &rsaquo; Integrações</a>.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-7 w-full justify-start text-left font-normal text-[11px] px-2 border-transparent hover:border-border bg-transparent hover:bg-background",
                      !scheduledDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-1.5 h-3 w-3 shrink-0" />
                    {scheduledDate
                      ? formatSP(`${scheduledDate}T12:00:00`, "dd/MM/yyyy")
                      : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    selected={scheduledDate ? new Date(`${scheduledDate}T12:00:00`) : undefined}
                    onSelect={(d) => {
                      if (!d) return;
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      onScheduledDateChange?.(`${yyyy}-${mm}-${dd}`);
                    }}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="p-2 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Hora</Label>
              <Input
                type="time"
                step={60}
                value={scheduledTime || ""}
                onChange={(e) => onScheduledTimeChange?.(e.target.value)}
                className="h-7 text-[11px] border-transparent hover:border-border focus:border-primary/50 bg-transparent transition-all px-2 focus:bg-background"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Lista</Label>
            <Select value={selectedListId || "all"} onValueChange={(v) => onListChange?.(v)}>
              <SelectTrigger className="h-7 text-[10px] border-transparent hover:border-border focus:border-primary/50 bg-transparent transition-all px-1 focus:bg-background">
                <SelectValue placeholder="Lista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos os contatos</SelectItem>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-xs">
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Perfil WA</Label>
            <Select value={selectedWhatsAppAccountId || ""} onValueChange={(v) => onWhatsAppAccountChange?.(v)}>
              <SelectTrigger className="h-7 text-[10px] border-transparent hover:border-border focus:border-primary/50 bg-transparent transition-all px-1 focus:bg-background">
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                {whatsappAccounts.length === 0 ? (
                  <SelectItem value="__none" disabled className="text-xs">Nenhum</SelectItem>
                ) : (
                  whatsappAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-xs">
                      {acc.verified_name || acc.display_phone || acc.phone_number_id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
        </div>

        <div className="space-y-3 pt-1 border-t border-border/40">
          <div className="flex items-center justify-between group">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <BrainCircuit className="h-3 w-3 text-primary" />
                <Label className="text-[10px] font-bold uppercase tracking-wider text-primary">STO (IA)</Label>
                <Badge variant="outline" className="h-3 px-1 text-[8px] border-primary/30 text-primary">PRO</Badge>
              </div>
              <span className="text-[9px] text-muted-foreground leading-tight">Melhor horário de envio</span>
            </div>
            <Switch checked={stoEnabled} onCheckedChange={onStoChange} className="scale-75" />
          </div>

          <div className="flex items-center justify-between group">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Split className="h-3 w-3 text-secondary" />
                <Label className="text-[10px] font-bold uppercase tracking-wider text-secondary">Teste A/B</Label>
              </div>
              <span className="text-[9px] text-muted-foreground leading-tight">Testar variações de cópia</span>
            </div>
            <Switch checked={isAbTest} onCheckedChange={onAbTestChange} className="scale-75" />
          </div>

          <div className="flex items-center justify-between group">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <FlaskConical className="h-3 w-3 text-orange-500" />
                <Label className="text-[10px] font-bold uppercase tracking-wider text-orange-500">Sandbox</Label>
              </div>
              <span className="text-[9px] text-muted-foreground leading-tight">Modo teste (sem custo)</span>
            </div>
            <Switch checked={isSandbox} onCheckedChange={onSandboxChange} className="scale-75" />
          </div>
        </div>
      </div>
      </div>

      {/* Nodes Palette */}
      <ScrollArea className="flex-1 border-t border-border/40">
        <div className="p-3 space-y-4">
          {Object.entries(NODE_PALETTE).map(([group, items]) => (
            <div key={group} className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5 px-1">
                {groupLabels[group] || group}
              </p>
              <div className="grid grid-cols-1 gap-0.5">
                {items.map((item) => {
                  const Icon = iconMap[item.icon] || Zap;
                  return (
                    <div
                      key={item.type}
                      draggable={item.enabled}
                      onDragStart={(e) =>
                        item.enabled &&
                        onDragStart(e, { type: item.type, label: item.label, icon: item.icon, color: item.color })
                      }
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-xs transition-all border border-transparent ${
                        item.enabled
                          ? "cursor-grab hover:bg-accent hover:border-border/50 active:cursor-grabbing text-foreground/80 hover:text-foreground"
                          : "opacity-30 cursor-not-allowed grayscale"
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-sm flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: item.color }}
                      >
                        <Icon className="h-2.5 w-2.5" />
                      </div>
                      <span className="font-medium truncate">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
