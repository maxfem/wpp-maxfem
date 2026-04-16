import { ReactNode } from "react";
import { motion } from "framer-motion";

interface KPIGradientCardProps {
  title: string;
  value: string;
  unit?: string;
  gradient: "pink" | "cyan" | "magenta" | "purple";
  children?: ReactNode;
}

const gradientMap = {
  pink: "gradient-pink",
  cyan: "gradient-cyan",
  magenta: "gradient-magenta",
  purple: "gradient-button",
};

export function KPIGradientCard({ title, value, unit, gradient }: KPIGradientCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={`relative overflow-hidden rounded-2xl p-6 h-[140px] ${gradientMap[gradient]} text-white shadow-lg`}
    >
      {/* Decorative glow circle */}
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
      <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/5" />

      <p className="text-sm font-medium text-white/80 mb-2">{title}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-heading text-3xl font-bold tracking-tight">{value}</span>
        {unit && <span className="text-sm font-medium text-white/70">{unit}</span>}
      </div>
    </motion.div>
  );
}
