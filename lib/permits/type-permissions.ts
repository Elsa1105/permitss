import { PERMIT_TYPE_HOT_WORK, PERMIT_TYPE_LIFTING } from "./lifting";
import { PERMIT_TYPE_BUNKERING } from "./bunkering";

export type PermissionUser = { role?: string | null; qualified_for?: string[] | null; active?: boolean | null };
const creatorRoles = new Set(["applicant", "guest_applicant", "contractor", "srm", "admin"]);
export function canCreatePermitType(user: PermissionUser, type: string): boolean {
  if (user.active === false || !creatorRoles.has(user.role ?? "")) return false;
  // Admin can raise every permit type without needing a qualification.
  if (user.role === "admin") return true;
  const qualifications = user.qualified_for ?? [];
  if (type === PERMIT_TYPE_HOT_WORK) return qualifications.includes("hot_work_applicant");
  if (type === PERMIT_TYPE_LIFTING) return qualifications.includes("lifting_applicant");
  if (type === PERMIT_TYPE_BUNKERING) return qualifications.includes("bunkering_applicant");
  return false;
}
export function canSeePermitType(user: PermissionUser, type: string): boolean {
  if (user.active === false) return false;
  if (user.role === "admin") return true;
  if (!["applicant", "guest_applicant", "contractor"].includes(user.role ?? "")) return true;
  if (type === PERMIT_TYPE_HOT_WORK) return (user.qualified_for ?? []).some(q => q.startsWith("hot_work_"));
  if (type === PERMIT_TYPE_LIFTING) return (user.qualified_for ?? []).some(q => q.startsWith("lifting_"));
  if (type === PERMIT_TYPE_BUNKERING) return (user.qualified_for ?? []).some(q => q.startsWith("bunkering_"));
  return false;
}
