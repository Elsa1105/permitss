import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { EndorsementSchema } from "@/lib/permits/schemas";
import { notifyPermitEvent } from "@/lib/notifications/permit-emails";

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

  return NextResponse.json(data);
}