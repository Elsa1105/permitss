import type { PermitState } from "@/lib/supabase/types";

/**
 * Permit state machine (mirrors PRD §4 and is enforced server-side in
 * supabase/migrations/0002_functions.sql). Used here for UI labels, badge
 * colours, and "what action is allowed next" gating in the permit detail view.
 */
export const STATE_LABEL: Record<PermitState, string> = {
  draft: "Draft",
  pending_safety_assessment: "Pending Safety Assessment",
  not_fit: "Not Fit",
  pending_srm_approval: "Pending SRM Approval",
  rejected: "Rejected",
  approved_active: "Approved / Active",
  pending_daily_endorsement: "Pending Daily Endorsement",
  revoked: "Revoked",
  pending_closure: "Pending Closure",
  closed_completed: "Closed / Completed",
  expired: "Expired",
};

export const STATE_BADGE: Record<
  PermitState,
  { className: string; tone: "neutral" | "info" | "warn" | "ok" | "bad" }
> = {
  draft:                     { className: "bg-slate-100 text-slate-700 border-slate-300",  tone: "neutral" },
  pending_safety_assessment: { className: "bg-amber-50 text-amber-800 border-amber-300",   tone: "warn" },
  not_fit:                   { className: "bg-red-50 text-red-700 border-red-300",         tone: "bad" },
  pending_srm_approval:      { className: "bg-amber-50 text-amber-800 border-amber-300",   tone: "warn" },
  rejected:                  { className: "bg-red-50 text-red-700 border-red-300",         tone: "bad" },
  approved_active:           { className: "bg-emerald-50 text-emerald-700 border-emerald-300", tone: "ok" },
  pending_daily_endorsement: { className: "bg-blue-50 text-blue-700 border-blue-300",      tone: "info" },
  revoked:                   { className: "bg-red-50 text-red-700 border-red-300",         tone: "bad" },
  pending_closure:           { className: "bg-blue-50 text-blue-700 border-blue-300",      tone: "info" },
  closed_completed:          { className: "bg-slate-100 text-slate-600 border-slate-300",  tone: "neutral" },
  expired:                   { className: "bg-slate-200 text-slate-600 border-slate-400",  tone: "neutral" },
};

export const TERMINAL_STATES: ReadonlySet<PermitState> = new Set([
  "not_fit",
  "rejected",
  "revoked",
  "closed_completed",
  "expired",
]);

export function isTerminal(state: PermitState): boolean {
  return TERMINAL_STATES.has(state);
}

export type PermitAction =
  | "edit_draft"
  | "submit_stage1"
  | "submit_stage2"
  | "submit_stage3"
  | "endorse_day"
  | "submit_stage4"
  | "view"
  | "print";

/** Returns true if `action` is permitted in the given state. */
export function canPerform(state: PermitState, action: PermitAction): boolean {
  switch (action) {
    case "edit_draft":
    case "submit_stage1":
      return state === "draft";
    case "submit_stage2":
      return state === "pending_safety_assessment";
    case "submit_stage3":
      return state === "pending_srm_approval";
    case "endorse_day":
      return state === "approved_active" || state === "pending_daily_endorsement";
    case "submit_stage4":
      return (
        state === "approved_active" ||
        state === "pending_daily_endorsement" ||
        state === "pending_closure"
      );
    case "view":
    case "print":
      return true;
  }
}
