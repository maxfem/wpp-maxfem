// Dropdown que combina: view mode (grid/list/compact) + seleção de colunas visíveis.
// Persistido em localStorage por chave (ex: "campaigns:view", "automations:view").
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sliders, LayoutGrid, List, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list" | "compact";

export interface ColumnDef {
  key: string;
  label: string;
  default?: boolean;
  required?: boolean; // não dá pra desligar
}

interface Props {
  storageKey: string;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  columns: ColumnDef[];
  visibleColumns: string[];
  onVisibleColumnsChange: (cols: string[]) => void;
}

export function ViewSettings({
  storageKey, viewMode, onViewModeChange, columns, visibleColumns, onVisibleColumnsChange,
}: Props) {
  // Persiste no mount + sempre que mudar
  useEffect(() => {
    try { localStorage.setItem(`${storageKey}:mode`, viewMode); } catch { /* ignore */ }
  }, [viewMode, storageKey]);

  useEffect(() => {
    try { localStorage.setItem(`${storageKey}:cols`, JSON.stringify(visibleColumns)); } catch { /* ignore */ }
  }, [visibleColumns, storageKey]);

  const toggle = (key: string) => {
    if (visibleColumns.includes(key)) {
      onVisibleColumnsChange(visibleColumns.filter((c) => c !== key));
    } else {
      onVisibleColumnsChange([...visibleColumns, key]);
    }
  };

  const reset = () => {
    onVisibleColumnsChange(columns.filter((c) => c.default !== false).map((c) => c.key));
  };

  return (
    <div className="flex items-center gap-2">
      {/* View mode toggle */}
      <div className="inline-flex items-center bg-muted/50 border border-border rounded-md p-0.5">
        <button
          onClick={() => onViewModeChange("grid")}
          className={cn("h-7 w-7 rounded inline-flex items-center justify-center transition-colors",
            viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          aria-label="Cards"
          title="Cards"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={cn("h-7 w-7 rounded inline-flex items-center justify-center transition-colors",
            viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          aria-label="Lista"
          title="Lista"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange("compact")}
          className={cn("h-7 w-7 rounded inline-flex items-center justify-center transition-colors",
            viewMode === "compact" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          aria-label="Compacto"
          title="Compacto"
        >
          <Rows3 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Columns toggle */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Sliders className="h-3.5 w-3.5" />
            Colunas
            <span className="text-muted-foreground">
              {visibleColumns.length}/{columns.length}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Exibir colunas</p>
              <button
                onClick={reset}
                className="text-[11px] text-primary hover:underline"
              >
                Padrão
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {columns.map((c) => {
                const checked = visibleColumns.includes(c.key);
                return (
                  <div key={c.key} className="flex items-center justify-between gap-2 py-0.5">
                    <Label htmlFor={`col-${c.key}`} className="text-xs cursor-pointer flex-1">
                      {c.label}
                      {c.required && <span className="text-muted-foreground ml-1">(fixo)</span>}
                    </Label>
                    <Checkbox
                      id={`col-${c.key}`}
                      checked={checked}
                      disabled={c.required}
                      onCheckedChange={() => !c.required && toggle(c.key)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Helper pra ler estado inicial do localStorage
export function loadViewSettings(
  storageKey: string,
  defaultMode: ViewMode,
  defaultColumns: ColumnDef[],
): { mode: ViewMode; cols: string[] } {
  let mode = defaultMode;
  let cols = defaultColumns.filter((c) => c.default !== false).map((c) => c.key);
  try {
    const m = localStorage.getItem(`${storageKey}:mode`);
    if (m === "grid" || m === "list" || m === "compact") mode = m;
    const c = localStorage.getItem(`${storageKey}:cols`);
    if (c) {
      const arr = JSON.parse(c);
      if (Array.isArray(arr)) cols = arr;
    }
  } catch { /* ignore */ }
  // sempre garante required
  const required = defaultColumns.filter((c) => c.required).map((c) => c.key);
  for (const r of required) if (!cols.includes(r)) cols.push(r);
  return { mode, cols };
}
