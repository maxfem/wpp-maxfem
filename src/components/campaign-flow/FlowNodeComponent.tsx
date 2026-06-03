import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, LogOut, StickyNote, Zap, Workflow,
  Paperclip,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  MessageCircle, Mail, MessageSquare, Phone, Globe,
  GitBranch, Network, Shuffle, Clock, Timer, CalendarClock,
  Archive, ArrowRightLeft, Tag, TagX: Tag, LogOut, StickyNote, Zap, Workflow,
};

export interface NodeMetrics {
  envios: number;
  cliques: number;
  entregues: number;
  abertos: number;
  falhas: number;
}

interface FlowNodeData {
  label: string;
  icon: string;
  color: string;
  nodeType: string;
  metrics?: NodeMetrics;
  templateContent?: { body?: string; header_type?: string; header_content?: string; buttons?: any[] };
  emailTemplateContent?: { subject?: string | null; body_html?: string | null };
  [key: string]: unknown;
}

function pct(n: number, base: number) {
  if (!base) return "0%";
  return `${Math.round((n / base) * 100)}%`;
}

function MetricsRow({ type, m }: { type: "whatsapp" | "email" | "sms"; m: NodeMetrics }) {
  const envios = m.envios || 0;
  const cells: { label: string; value: string; sub?: string }[] = [];
  cells.push({ label: "Envios", value: String(envios) });
  if (type === "email") {
    cells.push({ label: "Abrir", value: String(m.abertos || 0), sub: pct(m.abertos || 0, envios) });
  }
  cells.push({ label: "Clique", value: String(m.cliques || 0), sub: pct(m.cliques || 0, envios) });
  if (type === "email") {
    cells.push({ label: "Falhas", value: String(m.falhas || 0), sub: pct(m.falhas || 0, envios) });
  }
  return (
    <div className="grid border-b border-border bg-muted/30" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <div key={i} className="flex flex-col items-center justify-center px-1 py-1.5 border-r border-border last:border-r-0">
          <span className="text-[10px] font-semibold tabular-nums leading-none">{c.value}</span>
          {c.sub && <span className="text-[8px] text-muted-foreground leading-none mt-0.5">{c.sub}</span>}
          <span className="text-[8px] uppercase tracking-wide text-muted-foreground mt-0.5">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Preview WhatsApp ────────────────────────────────────────
function WhatsAppPreview({ data }: { data: FlowNodeData }) {
  const mode = data.messageMode as string | undefined;
  const hasAttach = (data.templateContent?.header_type === "image" || data.templateContent?.header_type === "video" || data.templateContent?.header_type === "document");
  const body =
    mode === "text" && data.messageText
      ? String(data.messageText)
      : data.templateContent?.body
      ? data.templateContent.body
      : data.templateName
      ? `[${data.templateName}]`
      : data.template
      ? `[${data.template}]`
      : "";

  if (!body && !hasAttach) return null;
  return (
    <div className="px-2 py-2 bg-[#e5ddd5] border-b border-border">
      <div className="bg-white rounded-md shadow-sm border border-black/5 p-2 text-[10px] leading-snug max-h-[160px] overflow-y-auto whitespace-pre-wrap">
        {hasAttach && (
          <div className="flex items-center gap-1 mb-1 text-[9px] text-muted-foreground bg-muted/40 px-1.5 py-1 rounded">
            <Paperclip className="h-2.5 w-2.5" /> Anexo
          </div>
        )}
        {body || <span className="italic text-muted-foreground">Sem texto</span>}
      </div>
    </div>
  );
}

// ─── Preview Email ───────────────────────────────────────────
function EmailPreview({ data }: { data: FlowNodeData }) {
  const tpl = data.emailTemplateContent;
  if (!tpl?.body_html && !tpl?.subject && !data.emailTemplate) return null;

  // Renderiza HTML real em iframe sandbox, com escala reduzida pra caber no node
  const html = tpl?.body_html || "";
  const subject = tpl?.subject || "";

  return (
    <div className="px-2 py-2 bg-muted/20 border-b border-border">
      <div className="bg-background rounded-md shadow-sm border border-border overflow-hidden">
        {subject && (
          <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold text-foreground truncate border-b border-border">
            {subject}
          </div>
        )}
        {html ? (
          <div className="relative bg-white" style={{ height: 180, width: "100%" }}>
            <iframe
              title="email-preview"
              srcDoc={html}
              sandbox=""
              style={{
                border: 0,
                width: "260%",
                height: "460%",
                transform: "scale(0.385)",
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            />
          </div>
        ) : (
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground italic">
            [{String(data.emailTemplate || "Template")}]
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Preview SMS ─────────────────────────────────────────────
function SmsPreview({ data }: { data: FlowNodeData }) {
  const body = data.message ? String(data.message) : "";
  if (!body) return null;
  return (
    <div className="px-2 py-2 bg-muted/20 border-b border-border">
      <div className="bg-blue-50 rounded-md shadow-sm border border-blue-200 p-2 text-[10px] leading-snug max-h-[120px] overflow-y-auto whitespace-pre-wrap">
        {body}
      </div>
    </div>
  );
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
  const isTriggerAuto = data.nodeType === "triggerAutomation";

  const isMessageNode = isWhatsApp || isEmail || isSms;
  const metricsForNode: NodeMetrics = data.metrics || { envios: 0, cliques: 0, entregues: 0, abertos: 0, falhas: 0 };
  const hasMetricsRow = isMessageNode;
  const hasPreview = isMessageNode;

  // Body text fallback (quando não tem preview)
  let bodyText = "Configurar...";
  if (data.subtitle) {
    bodyText = String(data.subtitle);
  } else if (isWhatsApp && data.messageMode === "text" && data.messageText) {
    bodyText = `Texto: ${String(data.messageText).slice(0, 50)}`;
  } else if (isWhatsApp && (data.template || data.templateName)) {
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
  } else if (isExit && data.reason) {
    bodyText = String(data.reason);
  } else if (isTriggerAuto && data.targetAutomationName) {
    bodyText = `→ ${String(data.targetAutomationName)}`;
  } else if (isTriggerAuto && data.targetAutomationId) {
    bodyText = `→ ${String(data.targetAutomationId).slice(0, 8)}…`;
  }

  return (
    <div
      className={`rounded-lg shadow-md border-2 bg-background min-w-[220px] max-w-[280px] transition-all ${
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

      {/* Métricas em strip */}
      {hasMetricsRow && (
        <MetricsRow type={isWhatsApp ? "whatsapp" : isEmail ? "email" : "sms"} m={metricsForNode} />
      )}

      {/* Preview do conteúdo */}
      {hasPreview && isWhatsApp && <WhatsAppPreview data={data} />}
      {hasPreview && isEmail && <EmailPreview data={data} />}
      {hasPreview && isSms && <SmsPreview data={data} />}

      {/* Body fallback (sem preview ou outros tipos de nó) */}
      {!isExit && !hasPreview && (
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
