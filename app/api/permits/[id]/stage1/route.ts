import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { LiftingStage1Schema, Stage1Schema } from "@/lib/permits/schemas";
import {
  hasLiftingQualification,
  isLiftingPermit,
} from "@/lib/permits/lifting";
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

  // ── Lifting Permit: own checklist + own user pool. Hot Work falls through
  // to the original logic below, untouched.
  const { data: typeRow } = await supabase
    .from("permits")
    .select("permit_type, applicant_id")
    .eq("id", id)
    .maybeSingle();

  if (isLiftingPermit(typeRow?.permit_type)) {
    const liftingParsed = LiftingStage1Schema.safeParse(body);

    if (!liftingParsed.success) {
      return NextResponse.json(
        {
          error:
            liftingParsed.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400 },
      );
    }

    const { data: liftingUser } = await supabase
      .from("users")
      .select("role, active, qualified_for")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (!liftingUser || !liftingUser.active) {
      return NextResponse.json(
        { error: "User account is inactive" },
        { status: 403 },
      );
    }

    const isOwnLiftingPermit = typeRow?.applicant_id === auth.user.id;

    if (
      !hasLiftingQualification(
        liftingUser,
        isOwnLiftingPermit ? "lifting_applicant" : "lifting_srm",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "You are not on the approved Lifting Permit user list for this action.",
        },
        { status: 403 },
      );
    }

    const { data: liftingData, error: liftingError } = await supabase.rpc(
      "permit_submit_stage1",
      {
        p_permit_id: id,
        p_stage_data: { form: "lifting", ...liftingParsed.data },
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
      event: "stage1_submitted",
    });

    return NextResponse.json(liftingData);
  }

  const parsed = Stage1Schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("id, role, active")
    .eq("id", auth.user.id)
    .single();

  if (userError || !currentUser) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 403 },
    );
  }

  if (!currentUser.active) {
    return NextResponse.json(
      { error: "User account is inactive" },
      { status: 403 },
    );
  }

  const { data: permit, error: permitError } = await supabase
    .from("permits")
    .select("id, applicant_id, state")
    .eq("id", id)
    .single();

  if (permitError || !permit) {
    return NextResponse.json({ error: "Permit not found" }, { status: 404 });
  }

  const isGuestOrContractor =
    currentUser.role === "guest_applicant" ||
    currentUser.role === "contractor";

  const isOwnPermit = permit.applicant_id === auth.user.id;

  if (isGuestOrContractor && isOwnPermit) {
    const { count, error: documentError } = await supabase
      .from("permit_documents")
      .select("id", { count: "exact", head: true })
      .eq("permit_id", id)
      .eq("document_type", "risk_assessment");

    if (documentError) {
      return NextResponse.json(
        { error: documentError.message },
        { status: 400 },
      );
    }

    if (!count || count < 1) {
      return NextResponse.json(
        {
          error:
            "Risk Assessment / RA document is required before submitting Stage I.",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase.rpc("permit_submit_stage1", {
    p_permit_id: id,
    p_stage_data: parsed.data,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyPermitEvent({
    supabase,
    permitId: id,
    event: "stage1_submitted",
  });

  return NextResponse.json(data);
}