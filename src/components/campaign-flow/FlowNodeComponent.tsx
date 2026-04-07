import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, LogOut, StickyNote, Zap,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, TagX: Tag, LogOut, StickyNote, Zap,
};

interface FlowNodeData {
  label: string;
  icon: string;
  color: string;
  nodeType: string;
  [key: string]: unknown;
}

function FlowNodeComponent({ data, selected }: NodeProps & { data: FlowNodeData }) {
  const Icon = iconMap[data.icon] || Zap;
  const isExit = data.nodeType === "exit";
  const isWhatsApp = data.nodeType === "sendWhatsApp";

  return (
    <div
      className={`rounded-lg shadow-md border-2 bg-background min-w-[200px] transition-all ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground !border-background" />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md text-white text-xs font-semibold"
        style={{ backgroundColor: data.color }}
      >
        <Icon className="h-3.5 w-3.5" />
        {data.label}
      </div>

      {/* Body */}
      {!isExit && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {isWhatsApp ? "Clique para configurar a mensagem" : "Configurar..."}
        </div>
      )}

      {/* Output handles */}
      {isWhatsApp ? (
        <div className="border-t border-border">
          {["Se clicar em algum link", "Se responder", "Se não responder", "Próxima etapa"].map((label, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border last:border-b-0">
              <span>{label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`out-${i}`}
                className="!relative !transform-none !w-2.5 !h-2.5 !border-background"
                style={{
                  backgroundColor:
                    i === 0 ? "#eab308" : i === 1 ? "#22c55e" : i === 2 ? "#ef4444" : "#6b7280",
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-muted-foreground !border-background"
        />
      )}
    </div>
  );
}

export default memo(FlowNodeComponent);
