// Filtro de período pra páginas de DETALHE (CampaignDetails/AutomationDetails).
// Saída: { from, to } no fuso de São Paulo, ou null pra "Geral" (sem filtro).
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodPreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

export interface PeriodRange {
  preset: PeriodPreset;
  from: Date | null;
  to: Date | null;
}

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "all", label: "Geral" },
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

export function presetToRange(preset: PeriodPreset, custom?: { from?: Date; to?: Date }): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case "today":     return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "7d":        return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d":       return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "custom":    return { from: custom?.from ? startOfDay(custom.from) : null, to: custom?.to ? endOfDay(custom.to) : null };
    default:          return { from: null, to: null };
  }
}

interface Props {
  value: PeriodRange;
  onChange: (v: PeriodRange) => void;
  compact?: boolean;
}

export function PeriodFilter({ value, onChange, compact }: Props) {
  const [calOpen, setCalOpen] = useState(false);

  const label = useMemo(() => {
    if (value.preset === "custom" && value.from) {
      if (value.to && format(value.from, "yyyy-MM-dd") !== format(value.to, "yyyy-MM-dd")) {
        return `${format(value.from, "dd/MM")} – ${format(value.to, "dd/MM")}`;
      }
      return format(value.from, "dd/MM/yyyy");
    }
    return PRESETS.find((p) => p.key === value.preset)?.label || "Geral";
  }, [value]);

  const select = (preset: PeriodPreset) => {
    const r = presetToRange(preset);
    onChange({ preset, from: r.from, to: r.to });
  };

  return (
    <div className={cn("inline-flex items-center gap-1 p-1 bg-muted/50 rounded-lg border border-border", compact && "scale-95")}>
      {PRESETS.map((p) => {
        const active = value.preset === p.key;
        return (
          <button
            key={p.key}
            onClick={() => select(p.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            {p.key === "all" && <InfinityIcon className="h-3 w-3" />}
            {p.label}
          </button>
        );
      })}

      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              value.preset === "custom"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {value.preset === "custom" ? label : "Personalizado"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-3">
          <div className="space-y-3">
            <p className="text-xs font-semibold">Selecione um intervalo</p>
            <Calendar
              mode="range"
              locale={ptBR}
              selected={{ from: value.from ?? undefined, to: value.to ?? undefined }}
              onSelect={(range) => {
                if (range?.from) {
                  onChange({
                    preset: "custom",
                    from: startOfDay(range.from),
                    to: range.to ? endOfDay(range.to) : endOfDay(range.from),
                  });
                  if (range.to) setCalOpen(false);
                }
              }}
              className="pointer-events-auto"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const DEFAULT_PERIOD: PeriodRange = { preset: "all", from: null, to: null };
