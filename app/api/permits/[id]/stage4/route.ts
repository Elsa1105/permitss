import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { notifyPermitEvent } from "@/lib/notifications/permit-emails";
import { checkLiftingAccess } from "@/lib/permits/lifting-access";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lifting permits: the Lifting Supervisor or the Lifting SRM pool (no-op for others).
  const liftingDenied = await checkLiftingAccess(supabase, id, auth.user.id, [
    "lifting_applicant",
    "lifting_srm",
  ]);

  if (liftingDenied) {
    return NextResponse.json({ error: liftingDenied }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("permit_submit_stage4", {
    p_permit_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // The close-out is already committed at this point. A failed email
  // (SMTP outage, bad recipient) must not make the user think it failed.
  try {
    await notifyPermitEvent({
      supabase,
      permitId: id,
      event: "stage4_closed",
    });
  } catch (notifyError) {
    console.error("[stage4] close-out notification failed", notifyError);
  }

  return NextResponse.json(data);
}