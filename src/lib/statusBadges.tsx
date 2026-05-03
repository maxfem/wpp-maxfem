import { FileText, Zap, Clock, Check, AlertTriangle, Pause, Send, type LucideIcon } from "lucide-react";

export type StatusTone = "neutral" | "success" | "warning" | "info" | "destructive";

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: StatusTone;
}

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  info: "bg-info/10 text-info border-info/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
};

export const toneClass = (tone: StatusTone) => TONE_CLASS[tone];

/** Status used for both campaigns and automations (kind=campaign|automation). */
export const STATUS_META: Record<string, StatusMeta> = {
  draft:     { label: "Rascunho", icon: FileText,      tone: "neutral" },
  scheduled: { label: "Agendada", icon: Clock,         tone: "warning" },
  sending:   { label: "Enviando", icon: Send,          tone: "info" },
  sent:      { label: "Enviada",  icon: Check,         tone: "success" },
  running:   { label: "Ativa",    icon: Zap,           tone: "success" },
  paused:    { label: "Pausada",  icon: Pause,         tone: "warning" },
  failed:    { label: "Falhou",   icon: AlertTriangle, tone: "destructive" },
  finished:  { label: "Encerrada",icon: Check,         tone: "neutral" },
};

export function getStatusMeta(status: string | null | undefined, kind: "campaign" | "automation" = "campaign"): StatusMeta {
  if (!status) return STATUS_META.draft;
  const meta = STATUS_META[status];
  if (meta) return meta;
  // Fallback for automation-specific labels
  if (kind === "automation" && status === "draft") return { ...STATUS_META.draft, label: "Inativa" };
  return STATUS_META.draft;
}
