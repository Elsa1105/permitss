import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { LiftingStage2Schema, Stage2Schema } from "@/lib/permits/schemas";
import { isLiftingPermit } from "@/lib/permits/lifting";
import { checkLiftingAccess } from "@/lib/permits/lifting-access";
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

  // ── Lifting Permit: Fit / Not Fit only, own assessor pool. Hot Work falls
  // through to the original logic below, untouched.
  const { data: typeRow } = await supabase
    .from("permits")
    .select("permit_type")
    .eq("id", id)
    .maybeSingle();

  if (isLiftingPermit(typeRow?.permit_type)) {
    const denied = await checkLiftingAccess(supabase, id, auth.user.id, [
      "lifting_assessor",
      "lifting_srm",
    ]);

    if (denied) {
      return NextResponse.json({ error: denied }, { status: 403 });
    }

    const liftingParsed = LiftingStage2Schema.safeParse(body);

    if (!liftingParsed.success) {
      return NextResponse.json(
        {
          error:
            liftingParsed.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400 },
      );
    }

    const { data: liftingData, error: liftingError } = await supabase.rpc(
      "permit_submit_stage2",
      {
        p_permit_id: id,
        p_fit: liftingParsed.data.fit,
        p_remarks: liftingParsed.data.remarks || null,
        p_checklist: {},
        p_corrective_action: liftingParsed.data.corrective_action || null,
        p_rectification_date: liftingParsed.data.rectification_date || null,
      },
    );

    if (liftingError) {
      return NextResponse.json(
        { error: liftingError.message },
        { status: 400 },
      );
    }

    await notifyPermitEvent({
      supabase,
      permitId: id,
      event: liftingParsed.data.fit ? "stage2_fit" : "stage2_not_fit",
      note: liftingParsed.data.remarks,
    });

    return NextResponse.json(liftingData);
  }

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