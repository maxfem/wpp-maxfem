import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as fnsFormat } from "date-fns";
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
