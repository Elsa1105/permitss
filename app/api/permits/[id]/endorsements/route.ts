import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { EndorsementSchema } from "@/lib/permits/schemas";
import { notifyPermitEvent } from "@/lib/notifications/permit-emails";
import { checkLiftingAccess } from "@/lib/permits/lifting-access";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lifting permits: only the approved Lifting SRM pool (no-op for others).
  const liftingDenied = await checkLiftingAccess(supabase, id, auth.user.id, [
    "lifting_srm",
  ]);

  if (liftingDenied) {
    return NextResponse.json({ error: liftingDenied }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);

  const parsed = EndorsementSchema.safeParse({
    day_number: Number(raw?.day),
    action: raw?.action,
    remarks: raw?.remarks ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  // Prevent silent backfilling of missing days as if inspected.
  // The existing SQL RPC auto-fills earlier missing days, so never call it
  // for a later day while earlier days are outstanding.
  const { data: permit, error: permitError } = await supabase
    .from("permits")
    .select("date_commencement")
    .eq("id", id)
    .single();
  if (permitError || !permit) {
    return NextResponse.json({ error: "Permit not found" }, { status: 404 });
  }
  const { data: priorDays, error: daysError } = await supabase
    .from("permit_endorsements")
    .select("day_number")
    .eq("permit_id", id);
  if (daysError) {
    return NextResponse.json({ error: daysError.message }, { status: 400 });
  }
  const completed = new Set((priorDays ?? []).map((row) => row.day_number));
  if (completed.has(parsed.data.day_number)) {
    return NextResponse.json({ error: "This day is already endorsed" }, { status: 409 });
  }
  const missingEarlier = Array.from(
    { length: parsed.data.day_number - 2 },
    (_, index) => index + 2,
  ).filter((day) => !completed.has(day));
  if (missingEarlier.length > 0) {
    return NextResponse.json({
      error: `Endorse Day ${missingEarlier[0]} first. Automatic backfilling is disabled for safety.`,
    }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("permit_endorse_day", {
    p_permit_id: id,
    p_day: parsed.data.day_number,
    p_action: parsed.data.action,
    p_remarks: parsed.data.remarks?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Bulk catch-up (migration 0024): permit_endorse_day() auto-fills any
  // earlier open day as Continue when a later day is submitted. Surface
  // that in the notification note so recipients aren't confused about
  // where those extra endorsement rows came from.
  const filledDays: number[] = Array.isArray(data?.filled_days)
    ? data.filled_days
    : [];

  // The endorsement is already committed; a failed email must not surface
  // as a failed endorsement.
  try {
    await notifyPermitEvent({
      supabase,
      permitId: id,
      event: "daily_endorsement",
      note: `Day ${parsed.data.day_number} — ${parsed.data.action}${
        parsed.data.remarks ? `: ${parsed.data.remarks}` : ""
      }${
        filledDays.length
          ? ` (Day ${filledDays.join(", ")} auto-filled as Continue)`
          : ""
      }`,
    });
  } catch (notifyError) {
    console.error("[endorsement] notification failed", notifyError);
  }

  return NextResponse.json(data);
}