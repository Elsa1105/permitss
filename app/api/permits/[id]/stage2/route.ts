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

  const body = await request.json();
  const parsed = Stage2Schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const checklistPayload =
    parsed.data.checklist_status ?? parsed.data.checklist ?? {};

  const { data, error } = await supabase.rpc("permit_submit_stage2", {
    p_permit_id: id,
    p_fit: parsed.data.fit,
    p_remarks: parsed.data.remarks || null,
    p_checklist: checklistPayload,
    p_corrective_action: parsed.data.corrective_action || null,
    p_rectification_date: parsed.data.rectification_date || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyPermitEvent({
    supabase,
    permitId: id,
    event: parsed.data.fit ? "stage2_fit" : "stage2_not_fit",
    note: parsed.data.remarks,
  });

  return NextResponse.json(data);
}