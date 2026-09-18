import type { PermitRow } from "@/lib/supabase/types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_ENDORSEMENT_DAY = 14;

/** Day number relative to date_commencement. Day 1 = commencement day. */
export function currentPermitDay(
  permit: Pick<PermitRow, "date_commencement">,
): number {
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

export function maxEndorsementDay(
  permit: Pick<PermitRow, "date_commencement" | "date_completion">,
): number {
  return Math.min(permitDayRange(permit), MAX_ENDORSEMENT_DAY);
}

export function isMultiDay(
  permit: Pick<PermitRow, "date_commencement" | "date_completion">,
): boolean {
  return permitDayRange(permit) > 1;
}

export function isWithinEndorsementRange(day: number): boolean {
  return day >= 2 && day <= MAX_ENDORSEMENT_DAY;
}