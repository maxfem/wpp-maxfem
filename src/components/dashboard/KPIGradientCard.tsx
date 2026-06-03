import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KPIGradientCardProps {
  title: string;
  value: string;
  unit?: string;
  gradient: "pink" | "cyan" | "magenta" | "purple";
  tooltip?: string;
  children?: ReactNode;
  onClick?: () => void;
}

const gradientMap = {
  pink: "gradient-pink",
  cyan: "gradient-cyan",
  magenta: "gradient-magenta",
  purple: "gradient-button",
};

export function KPIGradientCard({ title, value, unit, gradient, tooltip, onClick }: KPIGradientCardProps) {
  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
        className={`relative overflow-hidden rounded-2xl p-6 h-[140px] ${gradientMap[gradient]} text-white shadow-lg ${onClick ? "cursor-pointer" : ""}`}
      >
        {/* Decorative glow circle */}
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
        <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/5" />

        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-sm font-medium text-white/80 whitespace-pre-line leading-tight">{title}</p>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-white/40 cursor-help hover:text-white/80 transition-colors" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[200px] text-[11px] p-2 leading-tight bg-card/95 backdrop-blur-md border-white/10 text-foreground shadow-2xl">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-3xl font-bold tracking-tight">{value}</span>
          {unit && <span className="text-sm font-medium text-white/70">{unit}</span>}
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
