import { PERMIT_TYPE_HOT_WORK, PERMIT_TYPE_LIFTING } from "./lifting";

export type PermissionUser = { role?: string | null; qualified_for?: string[] | null; active?: boolean | null };
const creatorRoles = new Set(["applicant", "guest_applicant", "contractor", "srm", "admin"]);
export function canCreatePermitType(user: PermissionUser, type: string): boolean {
  if (user.active === false || !creatorRoles.has(user.role ?? "")) return false;
  const qualifications = user.qualified_for ?? [];
  if (type === PERMIT_TYPE_HOT_WORK) return qualifications.includes("hot_work_applicant");
  if (type === PERMIT_TYPE_LIFTING) return qualifications.includes("lifting_applicant");
  return false;
}
export function canSeePermitType(user: PermissionUser, type: string): boolean {
  if (user.active === false) return false;
  if (!["applicant", "guest_applicant", "contractor"].includes(user.role ?? "")) return true;
  if (type === PERMIT_TYPE_HOT_WORK) return (user.qualified_for ?? []).some(q => q.startsWith("hot_work_"));
  if (type === PERMIT_TYPE_LIFTING) return (user.qualified_for ?? []).some(q => q.startsWith("lifting_"));
  return false;
}
