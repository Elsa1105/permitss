import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import {
  hasBunkeringQualification,
  isBunkeringPermit,
  type BunkeringQualification,
} from "./bunkering";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Bunkering permits use their own pool of users.
 *
 * Returns an error message when the permit is a Bunkering permit and the
 * current user is NOT on the approved list for this action. Returns null
 * (= allowed) for every other permit type, so Hot Work and Lifting
 * behaviour is unchanged.
 */
export async function checkBunkeringAccess(
  supabase: ServerSupabase,
  permitId: string,
  userId: string,
  allowed: BunkeringQualification[],
): Promise<string | null> {
  const { data: permit } = await supabase
    .from("permits")
    .select("permit_type")
    .eq("id", permitId)
    .maybeSingle();

  if (!permit || !isBunkeringPermit(permit.permit_type)) return null;

  const { data: user } = await supabase
    .from("users")
    .select("role, active, qualified_for")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.active || !hasBunkeringQualification(user, ...allowed)) {
    return "You are not on the approved Hazardous Work Permit user list for this action.";
  }

  return null;
}
