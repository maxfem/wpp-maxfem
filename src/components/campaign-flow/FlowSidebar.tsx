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

interface FlowSidebarProps {
  campaignName: string;
  onNameChange: (name: string) => void;
}

export function FlowSidebar({ campaignName, onNameChange }: FlowSidebarProps) {
  const onDragStart = (event: React.DragEvent, nodeData: { type: string; label: string; icon: string; color: string }) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-[280px] border-r border-border bg-background flex flex-col h-full">
      {/* Campaign config */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome</Label>
          <Input
            value={campaignName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Nome da campanha"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Lista</Label>
          <Select>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecionar lista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os contatos</SelectItem>
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
