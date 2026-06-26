import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Stage2Schema } from "@/lib/permits/schemas";
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

  const body = await request.json().catch(() => null);
  const parsed = Stage2Schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  const cleanedRemarks = parsed.data.remarks?.trim() ?? "";

  const { data, error } = await supabase.rpc("permit_submit_stage2", {
    p_permit_id: id,
    p_fit: parsed.data.fit,
    p_remarks: cleanedRemarks,
    p_checklist: parsed.data.checklist ?? {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyPermitEvent({
    supabase,
    permitId: id,
    event: parsed.data.fit ? "stage2_fit" : "stage2_not_fit",
    note: cleanedRemarks,
  });

  return NextResponse.json(data);
}