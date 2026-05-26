// Tabs de status reutilizáveis pra Campaigns e Automations.
// Buckets agregados:
//   ativa     = scheduled, sending, running
//   enviada   = sent, completed
//   rascunho  = draft
//   falhou    = failed, error
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, FileEdit, PlayCircle, Send, XCircle, LayoutList } from "lucide-react";

export type StatusBucket = "all" | "active" | "sent" | "draft" | "failed";

export function bucketOf(status: string | null | undefined): StatusBucket {
  const s = (status || "").toLowerCase();
  if (["scheduled", "sending", "running", "active", "paused"].includes(s)) return "active";
  if (["sent", "completed", "delivered"].includes(s)) return "sent";
  if (["draft"].includes(s)) return "draft";
  if (["failed", "error", "rejected"].includes(s)) return "failed";
  return "all";
}

interface Item {
  status?: string | null;
}

interface Props<T extends Item> {
  items: T[];
  value: StatusBucket;
  onChange: (v: StatusBucket) => void;
  noun?: string; // "campanhas" | "automações"
}

const BUCKETS: { key: StatusBucket; label: string; icon: any }[] = [
  { key: "all", label: "Todas", icon: LayoutList },
  { key: "active", label: "Ativas", icon: PlayCircle },
  { key: "sent", label: "Enviadas", icon: Send },
  { key: "draft", label: "Rascunho", icon: FileEdit },
  { key: "failed", label: "Falhou", icon: XCircle },
];

export function StatusTabs<T extends Item>({ items, value, onChange }: Props<T>) {
  const counts = items.reduce<Record<StatusBucket, number>>((acc, item) => {
    const b = bucketOf(item.status);
    acc[b] = (acc[b] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, { all: 0, active: 0, sent: 0, draft: 0, failed: 0 });

  return (
    <div className="inline-flex items-center gap-1 p-1 bg-muted/50 rounded-lg border border-border">
      {BUCKETS.map((b) => {
        const n = counts[b.key] || 0;
        const active = value === b.key;
        const Icon = b.icon;
        return (
          <button
            key={b.key}
            onClick={() => onChange(b.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active && b.key === "active" && "text-emerald-600", active && b.key === "sent" && "text-blue-600", active && b.key === "failed" && "text-rose-600")} />
            {b.label}
            <Badge variant="secondary" className={cn(
              "h-4 min-w-[18px] px-1 text-[10px] tabular-nums",
              active ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
            )}>
              {n}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
