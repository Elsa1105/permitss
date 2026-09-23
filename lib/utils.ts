import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// The app operates only in Singapore. All display timestamps and all
// "what day is it" logic must be anchored to SGT (UTC+8), not to the
// server's runtime timezone (Vercel functions run in UTC), otherwise
// times shown to users are off by 8 hours and day-boundary logic
// (permit day numbers, cron "today" checks) flips at the wrong moment.
export const SG_TIME_ZONE = "Asia/Singapore";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: SG_TIME_ZONE,
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SG_TIME_ZONE,
  });
}

/** Today's calendar date in Singapore time, as YYYY-MM-DD. */
export function todayISO(): string {
  // en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
