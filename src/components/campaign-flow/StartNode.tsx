import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Zap } from "lucide-react";

function StartNode({ data }: { data: { label?: string } }) {
  const label = data?.label || "Lead inserido";

  return (
    <div className="rounded-lg shadow-md border-2 border-primary bg-background min-w-[180px]">
      <div className="flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-t-md text-sm font-semibold">
        <Zap className="h-4 w-4" />
        {label}
      </div>
      <div className="px-4 py-2 text-xs text-muted-foreground">
        Próxima etapa
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-muted-foreground !border-background"
        />
      </div>
    </div>
  );
}

export default memo(StartNode);
