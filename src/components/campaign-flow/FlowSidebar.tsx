import { NODE_PALETTE } from "./nodeTypes";
import {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, LogOut, StickyNote, Zap,
  Lock,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

export const AUTOMATION_TRIGGERS = [
  { group: "Pedido", items: [
    { value: "order_created", label: "Pedido criado", description: "Disparado quando houver novo pedido" },
    { value: "order_created_boleto", label: "Pedido criado (Boleto)", description: "Disparado quando houver novo pedido de boleto" },
    { value: "order_created_pix", label: "Pedido criado (Pix)", description: "Disparado quando houver novo pedido de Pix" },
    { value: "order_paid", label: "Pedido pago", description: "Disparado quando pedido atualizado para pago" },
    { value: "order_rejected_card", label: "Pedido recusado (Cartão)", description: "Disparado quando pedido de cartão recusado" },
  ]},
  { group: "Carrinho abandonado", items: [
    { value: "cart_abandoned", label: "Carrinho abandonado criado", description: "Disparado quando houver novo carrinho abandonado" },
    { value: "cart_abandonment_pixel", label: "Carrinho abandonado (Pixel)", description: "Cliente identificado iniciou checkout no site e não comprou" },
  ]},
  { group: "Pixel de Rastreamento", items: [
    { value: "browse_abandonment", label: "Navegação abandonada", description: "Cliente identificado viu produtos no site mas não comprou" },
  ]},
  { group: "Número de rastreio", items: [
    { value: "tracking_created", label: "Número de rastreio criado", description: "Disparado quando houver novo número de rastreio" },
    { value: "tracking_updated", label: "Número de rastreio atualizado", description: "Disparado quando número de rastreio atualizado" },
  ]},
  { group: "Lead", items: [
    { value: "lead_created", label: "Lead inserido", description: "Disparado quando houver novo lead na lista" },
    { value: "lead_birthday", label: "Lead aniversariante", description: "Disparado quando houver lead aniversariante" },
  ]},
  { group: "Conversa", items: [
    { value: "conversation_created", label: "Conversa criada (WhatsApp)", description: "Disparado quando houver nova conversa de WhatsApp" },
    { value: "conversation_archived", label: "Conversa arquivada", description: "Disparado quando houver conversa arquivada" },
  ]},
  { group: "Avançado", items: [
    { value: "webhook", label: "Webhook", description: "Disparado quando houver nova requisição de webhook" },
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
    <div className="w-[280px] border-r border-border bg-background flex flex-col h-full">
      {/* Config */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome</Label>
          <Input
            value={campaignName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={isAutomation ? "Nome da automação" : "Nome da campanha"}
            className="h-8 text-sm"
          />
        </div>

        {isAutomation ? (
          /* Trigger selector for automations */
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-primary">Gatilho</Label>
            <Select value={selectedTrigger || ""} onValueChange={(v) => onTriggerChange?.(v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecionar gatilho" />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_TRIGGERS.map((group) => (
                  <div key={group.group}>
                    <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.group}
                    </div>
                    {group.items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <div className="flex flex-col">
                          <span>{item.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            {selectedTrigger && (
              <p className="text-[10px] text-muted-foreground">
                ⚡ {AUTOMATION_TRIGGERS.flatMap(g => g.items).find(i => i.value === selectedTrigger)?.description}
              </p>
            )}
          </div>
        ) : (
          /* Date/time for campaigns */
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Data de envio</Label>
              <Input
                type="date"
                value={scheduledDate || ""}
                onChange={(e) => onScheduledDateChange?.(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário de envio</Label>
              <Input
                type="time"
                value={scheduledTime || ""}
                onChange={(e) => onScheduledTimeChange?.(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Lista</Label>
          <Select value={selectedListId || "all"} onValueChange={(v) => onListChange?.(v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecionar lista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os contatos</SelectItem>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} ({l.customer_count || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Perfil WhatsApp</Label>
          <Select>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecionar perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Perfil padrão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Node palette */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {Object.entries(NODE_PALETTE).map(([group, items]) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {groupLabels[group] || group}
              </p>
              <div className="space-y-1">
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
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                        item.enabled
                          ? "cursor-grab hover:bg-accent active:cursor-grabbing"
                          : "opacity-40 cursor-not-allowed"
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: item.color }}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="text-foreground">{item.label}</span>
                      {!item.enabled && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
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
