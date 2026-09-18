/**
 * Canonical Continue / Reject / Revoke definitions.
 *
 * Source: Alex Lim's email, "Reject vs. Revoke Definitions" (28 Jul 2026).
 * These strings are shown as footnotes wherever a Reject or Revoke decision
 * can be made (Stage III approval, and the Day 2-14 daily endorsement), so
 * the wording stays identical everywhere instead of drifting between forms.
 */

export const CONTINUE_DEFINITION =
  "Continue: the SRM confirms work may proceed for the day, with no change to the permit's approval.";

export const REJECT_DEFINITION =
  "Reject: at Day 0 of the application, the SRM does not approve the permit.";

export const REVOKE_DEFINITION =
  "Revoke: following an initial approval, the SRM subsequently disallows the work from proceeding or continuing.";
