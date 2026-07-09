import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { NewPermitSchema } from "@/lib/permits/schemas";

const ALLOWED_CREATOR_ROLES = new Set([
  "applicant",
  "guest_applicant",
  "contractor",
  "admin",
  "srm",
]);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = NewPermitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;

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

  if (!ALLOWED_CREATOR_ROLES.has(currentUser.role)) {
    return NextResponse.json(
      { error: "You are not allowed to create a permit" },
      { status: 403 },
    );
  }

  const isGuestApplicant =
    currentUser.role === "guest_applicant" ||
    currentUser.role === "contractor";

  if (isGuestApplicant) {
    if (!payload.contractor_company?.trim()) {
      return NextResponse.json(
        { error: "Contractor company is required for guest applicant" },
        { status: 400 },
      );
    }

    if (!payload.contractor_supervisor_name?.trim()) {
      return NextResponse.json(
        { error: "Contractor supervisor name is required for guest applicant" },
        { status: 400 },
      );
    }

    if (!payload.contractor_supervisor_registration_no?.trim()) {
      return NextResponse.json(
        {
          error:
            "Contractor supervisor registration number is required for guest applicant",
        },
        { status: 400 },
      );
    }

    if (!payload.worker_briefing_acknowledged) {
      return NextResponse.json(
        {
          error:
            "Worker briefing acknowledgement is required for guest applicant",
        },
        { status: 400 },
      );
    }

    if (!payload.top_controls_summary?.trim()) {
      return NextResponse.json(
        {
          error: "Top controls summary is required for guest applicant",
        },
        { status: 400 },
      );
    }
  }

  const { data: serialData, error: serialError } = await supabase.rpc(
    "next_permit_serial",
    { p_permit_type: "hot_work_onshore" },
  );

  if (serialError || !serialData) {
    return NextResponse.json(
      { error: serialError?.message ?? "Could not generate serial number" },
      { status: 500 },
    );
  }

  const { data: insertedPermit, error: insertError } = await supabase
    .from("permits")
    .insert({
      serial_no: serialData as string,
      permit_type: "hot_work_onshore",
      company_id: payload.company_id,
      site_id: payload.site_id,
      state: "draft",

      vessel_project: payload.vessel_project,
      location_of_work: payload.location_of_work,
      date_commencement: payload.date_commencement,
      date_completion: payload.date_completion,
      description: payload.description,
      hazard_types: payload.hazard_types,
      contractor: payload.contractor,

      contractor_company: payload.contractor_company || null,
      contractor_supervisor_name: payload.contractor_supervisor_name || null,
      contractor_supervisor_registration_no:
        payload.contractor_supervisor_registration_no || null,
      worker_briefing_acknowledged:
        payload.worker_briefing_acknowledged ?? false,
      top_controls_summary: payload.top_controls_summary || null,

      applicant_id: auth.user.id,
    })
    .select("id, serial_no")
    .single();

  if (insertError || !insertedPermit) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create permit" },
      { status: 500 },
    );
  }

  await supabase.rpc("write_audit", {
    p_permit_id: insertedPermit.id,
    p_action: isGuestApplicant ? "created_by_guest_applicant" : "created",
    p_from: null,
    p_to: "draft",
    p_reason: null,
    p_metadata: {
      actor_role: currentUser.role,
      company_id: payload.company_id,
      site_id: payload.site_id,
      contractor_company: payload.contractor_company || null,
      contractor_supervisor_name: payload.contractor_supervisor_name || null,
      contractor_supervisor_registration_no:
        payload.contractor_supervisor_registration_no || null,
    },
  });

  
  return NextResponse.json(insertedPermit, { status: 201 });
}