import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface MiniMetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
}

export function MiniMetricCard({ icon: Icon, label, value, change, trend = "neutral" }: MiniMetricCardProps) {
  const trendColors = {
    up: "bg-neon-green/15 text-neon-green",
    down: "bg-destructive/15 text-destructive",
    neutral: "bg-muted text-muted-foreground",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-neon-magenta" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-lg font-bold text-foreground">{value}</p>
      </div>
      {change && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trendColors[trend]}`}>
          {change}
        </span>
      )}
    </motion.div>
  );
}
