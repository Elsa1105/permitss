import type { PermitRow, PermitState } from "@/lib/supabase/types";
import {
  currentPermitDay,
  isMultiDay,
  maxEndorsementDay,
} from "@/lib/permits/day";

/**
 * Status shown to users for a live permit.
 *
 * The stored `permits.state` for an active permit can be stale or inverted
 * (it is written by the Supabase RPC, not by the UI). What users actually
 * need to see is derived from the endorsement records:
 *
 *  - Pending Daily Endorsement: some day between Day 2 and today (capped at
 *    the permit's last endorsable day) has no endorsement row yet.
 *  - Approved / Active: every such day has been endorsed (or the permit is
 *    single-day and never needs a daily endorsement).
 *
 * Every other state (draft, revoked, closed, ...) is returned unchanged.
 */
export function effectivePermitState(
  permit: Pick<PermitRow, "state" | "date_commencement" | "date_completion">,
  endorsedDays: number[],
): PermitState {
  if (
    permit.state !== "approved_active" &&
    permit.state !== "pending_daily_endorsement"
  ) {
    return permit.state;
  }

  if (!isMultiDay(permit)) return "approved_active";

  const lastDueDay = Math.min(
    currentPermitDay(permit),
    maxEndorsementDay(permit),
  );
  const done = new Set(endorsedDays);

  for (let day = 2; day <= lastDueDay; day++) {
    if (!done.has(day)) return "pending_daily_endorsement";
  }

  return "approved_active";
}

/** Groups endorsement rows into permit_id -> endorsed day numbers. */
export function groupEndorsedDays(
  rows: Array<{ permit_id: string; day_number: number }> | null | undefined,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const list = map.get(row.permit_id);
    if (list) list.push(row.day_number);
    else map.set(row.permit_id, [row.day_number]);
  }
  return map;
}
