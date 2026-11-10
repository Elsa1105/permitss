import { PERMIT_TYPE_HOT_WORK, PERMIT_TYPE_LIFTING, LIFTING_FORM_NO } from "./lifting";
import { PERMIT_TYPE_BUNKERING, BUNKERING_FORM_NO } from "./bunkering";

/**
 * Single place that answers "which Form No. belongs to which permit type".
 * For now ALL three permit types use FOI-SG-057 (FOI-SG-061 is not used).
 * Safe for client and server code.
 */
export function formNoForPermitType(
  permitType?: string | null,
  companyCode?: string | null,
): string {
  if (permitType === PERMIT_TYPE_BUNKERING) return BUNKERING_FORM_NO;
  if (permitType === PERMIT_TYPE_LIFTING) return LIFTING_FORM_NO;
  void PERMIT_TYPE_HOT_WORK;
  return companyCode?.toUpperCase() === "CFE" ? "CFE-SG-057" : "FOI-SG-057";
}

/** Sidebar caption. */
export function allFormNosLabel(companyCode?: string | null): string {
  return formNoForPermitType(PERMIT_TYPE_HOT_WORK, companyCode);
}
