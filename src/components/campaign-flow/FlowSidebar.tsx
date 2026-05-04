import { NODE_PALETTE } from "./nodeTypes";
import {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, LogOut, StickyNote, Zap,
  Lock, CalendarIcon, BrainCircuit, Split
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

type TriggerItem = { value: string; label: string; description: string; enabled?: boolean };
type TriggerGroup = { group: string; items: TriggerItem[] };

export const AUTOMATION_TRIGGERS: TriggerGroup[] = [
  { group: "Pedido", items: [
    { value: "order_created", label: "Pedido criado", description: "Disparado quando houver novo pedido (qualquer método)", enabled: true },
    { value: "order_created_pix", label: "Pedido criado (Pix)", description: "Pedido criado aguardando pagamento Pix", enabled: true },
    { value: "order_created_boleto", label: "Pedido criado (Boleto)", description: "Pedido criado aguardando pagamento de boleto", enabled: true },
    { value: "order_paid", label: "Pedido pago", description: "Disparado quando o pagamento for confirmado", enabled: true },
    { value: "order_approved", label: "Pedido aprovado", description: "Pedido aprovado/faturado pelo lojista", enabled: true },
    { value: "order_delivered", label: "Pedido entregue", description: "Status alterado para entregue", enabled: true },
    { value: "order_rejected_card", label: "Pedido recusado (Cartão)", description: "Pagamento de cartão recusado", enabled: true },
    { value: "invoice_issued", label: "Nota fiscal emitida", description: "NF-e emitida para o pedido", enabled: true },
    { value: "return_approved", label: "Devolução aprovada", description: "Devolução, troca ou estorno aprovado", enabled: true },
    { value: "first_purchase", label: "Primeira compra", description: "Cliente concluiu sua primeira compra", enabled: true },
  ]},
  { group: "Carrinho & Navegação", items: [
    { value: "cart_abandoned", label: "Carrinho abandonado", description: "Carrinho registrado pela Yampi sem conversão", enabled: true },
    { value: "cart_abandonment_pixel", label: "Checkout abandonado (Pixel)", description: "Cliente identificado iniciou checkout no site e não comprou", enabled: true },
    { value: "browse_abandonment", label: "Navegação abandonada (Pixel)", description: "Cliente identificado viu produtos mas não comprou", enabled: true },
  ]},
  { group: "Pós-venda & Retenção", items: [
    { value: "birthday", label: "Aniversário do cliente", description: "Disparado todo dia no aniversário do cliente", enabled: true },
    { value: "first_purchase_anniversary", label: "Aniversário da 1ª compra", description: "Disparado anualmente na data da primeira compra", enabled: true },
    { value: "inactivity", label: "Inatividade", description: "Cliente sem comprar há X dias (defina X no nome: ex. \"60 dias\")", enabled: true },
    { value: "pos_delivery_7d", label: "7 dias após entrega", description: "Pós-venda 7 dias após o pedido ser entregue", enabled: true },
  ]},
  { group: "Em breve", items: [
    { value: "tracking_created", label: "Rastreio gerado", description: "Em desenvolvimento", enabled: false },
    { value: "tracking_updated", label: "Rastreio atualizado", description: "Em desenvolvimento", enabled: false },
    { value: "lead_created", label: "Lead inserido na lista", description: "Em desenvolvimento", enabled: false },
    { value: "conversation_created", label: "Nova conversa WhatsApp", description: "Em desenvolvimento", enabled: false },
    { value: "conversation_archived", label: "Conversa arquivada", description: "Em desenvolvimento", enabled: false },
    { value: "webhook", label: "Webhook customizado", description: "Em desenvolvimento", enabled: false },
  ]},
];

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
}

export function FlowSidebar({
  campaignName, onNameChange, selectedListId, onListChange,
  scheduledDate, onScheduledDateChange, scheduledTime, onScheduledTimeChange,
  isAutomation, selectedTrigger, onTriggerChange,
  selectedWhatsAppAccountId, onWhatsAppAccountChange,
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
                    {group.items.map((item) => (
                      <SelectItem key={item.value} value={item.value} disabled={item.enabled === false} className="text-xs">
                        <div className="flex items-center gap-2 py-0.5">
                          <span>{item.label}</span>
                          {item.enabled === false && <Lock className="h-3 w-3 text-muted-foreground/50" />}
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            {selectedTrigger && (
              <p className="text-[10px] text-muted-foreground/80 leading-snug px-1 pt-1 italic">
                {AUTOMATION_TRIGGERS.flatMap(g => g.items).find(i => i.value === selectedTrigger)?.description}
              </p>
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
              <Select value={scheduledTime || ""} onValueChange={(v) => onScheduledTimeChange?.(v)}>
                <SelectTrigger className="h-7 text-[11px] border-transparent hover:border-border focus:border-primary/50 bg-transparent transition-all px-2 focus:bg-background">
                  <SelectValue placeholder="--:--" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = String(Math.floor(i / 2)).padStart(2, "0");
                    const m = i % 2 === 0 ? "00" : "30";
                    const v = `${h}:${m}`;
                    return (
                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
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
                      {!item.enabled && <Lock className="h-2.5 w-2.5 ml-auto text-muted-foreground" />}
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
