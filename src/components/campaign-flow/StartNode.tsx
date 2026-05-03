import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Zap, ShoppingBag, MapPin, Calendar } from "lucide-react";

function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  const label = data?.label || "Lead inserido";
  const hasFilters = data?.filterProducts || data?.filterStates || data?.filterDays;

  return (
    <div className={`rounded-lg shadow-md border-2 bg-background min-w-[200px] transition-all ${
      selected ? "border-primary ring-2 ring-primary/20" : "border-primary"
    }`}>
      <div className="flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-t-md text-sm font-semibold">
        <Zap className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="px-4 py-2 space-y-2">
        {hasFilters ? (
          <div className="space-y-1.5 py-1">
            {data.filterProducts && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ShoppingBag className="h-3 w-3 shrink-0" />
                <span className="truncate">Produtos: {data.filterProducts}</span>
              </div>
            )}
            {data.filterStates && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">Estados: {data.filterStates}</span>
              </div>
            )}
            {data.filterDays && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span className="truncate">Dias: {data.filterDays}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground py-1">
            Sem filtros aplicados
          </div>
        )}
        
        <div className="pt-1 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase font-medium">Próxima etapa</span>
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-2.5 !h-2.5 !bg-muted-foreground !border-background !static !translate-y-0"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(StartNode);
