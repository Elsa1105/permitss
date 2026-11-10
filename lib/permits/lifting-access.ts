import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import {
  hasLiftingQualification,
  isLiftingPermit,
  type LiftingQualification,
} from "./lifting";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Returns an error when a Lifting Permit action is attempted by someone
 * without the required qualification. Other permit types are not affected.
 */
export async function checkLiftingAccess(
  supabase: ServerSupabase,
  permitId: string,
  userId: string,
  allowed: LiftingQualification[],
): Promise<string | null> {
  const { data: permit, error: permitError } = await supabase
    .from("permits")
    .select("permit_type")
    .eq("id", permitId)
    .maybeSingle();

  // Fail closed if the permit type cannot be established.
  if (permitError || !permit) return "Permit not found or access could not be verified.";
  if (!isLiftingPermit(permit.permit_type)) return null;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, active, qualified_for")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user || !user.active || !hasLiftingQualification(user, ...allowed)) {
    return "You are not authorized to perform this Lifting Permit action.";
  }

  return null;
}
