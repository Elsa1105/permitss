import type { PermitRow } from "@/lib/supabase/types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Day number relative to date_commencement. Day 1 = commencement day. */
export function currentPermitDay(permit: Pick<PermitRow, "date_commencement">): number {
  const start = new Date(permit.date_commencement + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, diff + 1);
}

export function permitDayRange(
  permit: Pick<PermitRow, "date_commencement" | "date_completion">,
): number {
  const start = new Date(permit.date_commencement + "T00:00:00");
  const end = new Date(permit.date_completion + "T00:00:00");
  const diff = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, diff + 1);
}

export function isMultiDay(
  permit: Pick<PermitRow, "date_commencement" | "date_completion">,
): boolean {
  return permitDayRange(permit) > 1;
}
