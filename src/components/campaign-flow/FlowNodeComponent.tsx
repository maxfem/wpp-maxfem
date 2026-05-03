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
  const isEmail = data.nodeType === "sendEmail";
  const isSms = data.nodeType === "sendSms";
  const isCondition = data.nodeType === "condition" || data.nodeType === "multiCondition";
  const isWait = data.nodeType === "wait" || data.nodeType === "waitCondition" || data.nodeType === "waitDate";
  const isWaitDate = data.nodeType === "waitDate";
  const isNote = data.nodeType === "note";
  const isTag = data.nodeType === "addTag" || data.nodeType === "removeTag";
  const isWebhook = data.nodeType === "sendWebhook";
  const isTransfer = data.nodeType === "transferChat";
  const isArchive = data.nodeType === "archiveChat";
  const isExit2 = data.nodeType === "exit";

  // Build body text based on node type
  let bodyText = "Configurar...";
  if (isWhatsApp && (data.template || data.templateName)) {
    bodyText = String(data.templateName || data.template);
  } else if (isEmail && data.emailTemplate) {
    bodyText = String(data.emailTemplate);
  } else if (isSms && data.message) {
    bodyText = String(data.message).slice(0, 60);
  } else if (isWaitDate && (data.date || data.time)) {
    bodyText = `${data.date || ""} ${data.time || ""}`.trim();
  } else if (isWait && data.duration) {
    bodyText = `${data.duration} ${String(data.unit || "").toLowerCase()}`.trim();
  } else if (isCondition && data.field) {
    bodyText = `${data.field} ${data.operator || ""} ${data.value || ""}`.trim();
  } else if (isNote && data.content) {
    bodyText = String(data.content);
  } else if (isTag && data.tagName) {
    bodyText = String(data.tagName);
  } else if (isWebhook && data.url) {
    bodyText = `${data.method || "POST"} ${String(data.url).slice(0, 30)}`;
  } else if (isTransfer && data.department) {
    bodyText = String(data.department);
  } else if (isArchive && data.reason) {
    bodyText = String(data.reason);
  } else if (isExit2 && data.reason) {
    bodyText = String(data.reason);
  }

  return (
    <div
      className={`rounded-lg shadow-md border-2 bg-background min-w-[200px] max-w-[260px] transition-all ${
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
        <div className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">
          {bodyText}
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
      ) : isCondition ? (
        <div className="border-t border-border">
          {["Atende a condição", "Não atende a nenhuma condição"].map((label, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border last:border-b-0">
              <span>{label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={i === 0 ? "condition-true" : "condition-false"}
                className="!relative !transform-none !w-2.5 !h-2.5 !border-background"
                style={{ backgroundColor: i === 0 ? "#22c55e" : "#ef4444" }}
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

export default FlowNodeComponent;
