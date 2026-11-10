/**
 * Bunkering Permit (3rd ePermit) — shared constants + helpers.
 *
 * Safe to import from both client and server code (no server-only imports).
 * The server-side access check lives in ./bunkering-access.ts.
 *
 */

export const PERMIT_TYPE_BUNKERING = "bunkering_operation";

export type BunkeringQualification =
  | "bunkering_applicant" // Bunkering Supervisor / Person-in-charge (Stage I)
  | "bunkering_assessor" // Assessor / WSH Coordinator / WSH Officer (Stage II)
  | "bunkering_srm"; // Ship-Repair Manager / Project Manager (Stage III)

export function isBunkeringPermit(permitType?: string | null): boolean {
  return permitType === PERMIT_TYPE_BUNKERING;
}

/**
 * 3rd ePermit = Hazardous Work Permit (Onshore), Form FOI-SG-057 for now (template FOI-SG-061 R1 not used yet).
 * (Internal type key stays "bunkering_operation" so no DB change is needed;
 * user-facing text says "Hazardous Work".)
 *
 * Stage I = "Type of Work" tick-boxes + "Precautions" tick-boxes.
 * Items are optional: tick what applies, leave the rest blank.
 */
export const BUNKERING_CHECKLIST = [
  { key: "chemical_cleaning", group: "work", label: "Chemical Cleaning" },
  { key: "dismantling", group: "work", label: "Dismantling pipes, valves testing" },
  { key: "bunkering", group: "work", label: "Bunkering" },
  { key: "grit_blasting", group: "work", label: "Grit Blasting" },
  { key: "ballasting", group: "work", label: "Ballasting / De-ballasting" },
  { key: "quayside", group: "work", label: "Working at Quayside / alongside water (>4 hrs)" },
  { key: "life_vest", group: "precaution", label: "SOLAS 100N or ISO rated life vest is worn" },
  { key: "guardrails", group: "precaution", label: "Bulwark, Guardrails or Perimeter guarding is robust and secured." },
] as const;

export const BUNKERING_TYPE_OF_WORK = BUNKERING_CHECKLIST.filter((i) => i.group === "work");
export const BUNKERING_PRECAUTIONS = BUNKERING_CHECKLIST.filter((i) => i.group === "precaution");

export type BunkeringChecklistKey = (typeof BUNKERING_CHECKLIST)[number]["key"];
export type BunkeringChecklistValue = "yes" | "na";

/** Header details printed on the PDF (Form FOI-SG-057 for now). */
export const BUNKERING_FORM_NO = "FOI-SG-057";
export const BUNKERING_FORM_REV = "R1";
export const BUNKERING_FORM_TITLE = "Hazardous Work Permit (Onshore)";
/** Effective date = ePermit go-live date. Change here or via env var. */
export const BUNKERING_EFFECTIVE_DATE =
  process.env.NEXT_PUBLIC_BUNKERING_EFFECTIVE_DATE || "15/12/2026";

export const BUNKERING_STAGE_I_DECLARATION =
  "I have taken measure to render the area safe and fit for work permit application. Further I shall also comply with the under-mentioned requirements prior to the commencement and duration of the work applied for.";

export const BUNKERING_STAGE_III_WORDING =
  "I have evaluated the hazards and risks associated with the job. I am fully satisfied that a thorough inspection and proper assessment of the work area and its surrounding have been made so that the said works can be carried out safely.";

/** Admin passes automatically; every other user needs explicit Bunkering qualification. */
export function hasBunkeringQualification(
  user: { role?: string | null; qualified_for?: string[] | null },
  ...allowed: BunkeringQualification[]
): boolean {
  if (user.role === "admin") return true;
  const qualified = user.qualified_for ?? [];
  return allowed.some((q) => qualified.includes(q));
}
