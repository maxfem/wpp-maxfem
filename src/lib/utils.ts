import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as fnsFormat, startOfDay, endOfDay, subDays, differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SP_TZ = "America/Sao_Paulo";

/** Convert any Date/string to a Date object in São Paulo timezone */
export function toSaoPaulo(date: Date | string | number): Date {
  return toZonedTime(typeof date === "string" || typeof date === "number" ? new Date(date) : date, SP_TZ);
}

/** Format a date using date-fns format, always in São Paulo timezone */
export function formatSP(date: Date | string | number, fmt: string): string {
  return fnsFormat(toSaoPaulo(date), fmt);
}

/** toLocaleString with São Paulo timezone forced */
export function localeSP(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", { timeZone: SP_TZ, ...options });
}

export type DatePeriodKey = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "all" | "custom";

export function getStandardPeriodRange(key: DatePeriodKey, customRange?: { from?: Date; to?: Date }): { from: Date; to: Date; days: number } {
  const now = toSaoPaulo(new Date());
  
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), days: 1 };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y), days: 1 };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), days: 7 };
    case "14d":
      return { from: startOfDay(subDays(now, 13)), to: endOfDay(now), days: 14 };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), days: 30 };
    case "90d":
      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now), days: 90 };
    case "all":
      return { from: new Date(0), to: endOfDay(now), days: -1 };
    case "custom": {
      if (customRange?.from && customRange?.to) {
        const from = startOfDay(toSaoPaulo(customRange.from));
        const to = endOfDay(toSaoPaulo(customRange.to));
        const days = differenceInDays(to, from) + 1;
        return { from, to, days };
      }
      // Default to 7d if custom is selected but range missing
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), days: 7 };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now), days: 1 };
  }
}
