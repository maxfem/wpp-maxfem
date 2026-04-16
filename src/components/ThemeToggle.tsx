import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { motion } from "framer-motion";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="relative flex h-7 w-14 items-center rounded-full p-1 transition-colors duration-300"
      style={{
        background: isDark
          ? "hsl(var(--muted))"
          : "linear-gradient(90deg, hsl(var(--neon-cyan)), hsl(var(--neon-amber)))",
      }}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      <motion.div
        className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md"
        animate={{ x: isDark ? 24 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {isDark ? (
          <Moon className="h-3 w-3 text-primary" />
        ) : (
          <Sun className="h-3 w-3 text-amber-500" />
        )}
      </motion.div>
    </button>
  );
}
