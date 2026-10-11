/**
 * Lifting Permit (FOI lifting form) — shared constants + helpers.
 *
 * Safe to import from both client and server code (no server-only imports).
 * The server-side access check lives in ./lifting-access.ts.
 */

export const PERMIT_TYPE_HOT_WORK = "hot_work_onshore";
export const PERMIT_TYPE_LIFTING = "lifting_operation";

export type LiftingQualification =
  | "lifting_applicant" // Lifting Supervisor (Stage I)
  | "lifting_assessor" // Assessor / WSH Coordinator / WSH Officer (Stage II)
  | "lifting_srm"; // Ship-Repair Manager / Project Manager (Stage III, endorsements)

export function isLiftingPermit(permitType?: string | null): boolean {
  return permitType === PERMIT_TYPE_LIFTING;
}

/**
 * Stage I conditions of issue, in the same order as the paper form.
 * Each item must be confirmed ("yes") or marked "na".
 */
export const LIFTING_CHECKLIST = [
  { key: "lm_certified", label: "Lifting Machine certified within 12 months" },
  { key: "licensed_operator", label: "Licensed Crane Operator" },
  { key: "lg_certified", label: "Lifting Gears certified within 12 months" },
  {
    key: "trained_crew",
    label: "Trained Lifting Crew: Signalman, Rigger",
  },
  { key: "within_swl", label: "LM, LG capacities within SWL" },
  { key: "safe_access", label: "Adequate and Safe Access" },
  {
    key: "load_radius_indicator",
    label: "Load radius indicator in good condition",
  },
  {
    key: "steel_plates",
    label: "Steel plates used for crane foundation",
  },
  {
    key: "limit_switches",
    label: "Limit switches in good working condition",
  },
  { key: "taglines", label: "Taglines of adequate length" },
  {
    key: "padeyes_mpi",
    label: "Fabricated lifting pad-eyes w/ MPI done",
  },
  {
    key: "zone_cordoned",
    label: "Lifting zone cordoned off with warning signs",
  },
  { key: "crane_checklist", label: "Crane checklist attached" },
  {
    key: "ra_briefing",
    label: "Risk Assessment Safety briefing conducted for lifting crews",
  },
] as const;

export type LiftingChecklistKey = (typeof LIFTING_CHECKLIST)[number]["key"];
export type LiftingChecklistValue = "yes" | "na";

/** Every user, including Admin, needs explicit Lifting qualification. */
export function hasLiftingQualification(
  user: { role?: string | null; qualified_for?: string[] | null },
  ...allowed: LiftingQualification[]
): boolean {
  const qualified = user.qualified_for ?? [];
  return allowed.some((q) => qualified.includes(q));
}
