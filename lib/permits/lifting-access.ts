import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import {
  hasLiftingQualification,
  isLiftingPermit,
  type LiftingQualification,
} from "./lifting";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Lifting permits use a separate pool of users from Hot Work.
 *
 * Returns an error message when the permit is a Lifting permit and the
 * current user is NOT on the approved list for this action. Returns null
 * (= allowed) for every other permit type, so Hot Work behaviour is
 * unchanged.
 */
export async function checkLiftingAccess(
  supabase: ServerSupabase,
  permitId: string,
  userId: string,
  allowed: LiftingQualification[],
): Promise<string | null> {
  const { data: permit } = await supabase
    .from("permits")
    .select("permit_type")
    .eq("id", permitId)
    .maybeSingle();

  if (!permit || !isLiftingPermit(permit.permit_type)) return null;

  const { data: user } = await supabase
    .from("users")
    .select("role, active, qualified_for")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.active || !hasLiftingQualification(user, ...allowed)) {
    return "You are not on the approved Lifting Permit user list for this action.";
  }

  return null;
}
