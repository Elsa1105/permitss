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

  const { data: serialData, error: serialErr } = await supabase.rpc(
    "next_permit_serial",
    { p_permit_type: "hot_work_onshore" },
  );

  if (serialErr || !serialData) {
    return NextResponse.json(
      { error: serialErr?.message ?? "Could not generate serial number" },
      { status: 500 },
    );
  }

  const insert = await supabase
    .from("permits")
    .insert({
      serial_no: serialData as string,
      permit_type: "hot_work_onshore",
      company_id: payload.company_id,
      site_id: payload.site_id,
      state: "draft",

      display_applicant_name: payload.display_applicant_name || null,
      display_applicant_department:
        payload.display_applicant_department || null,

      vessel_project: payload.vessel_project,
      location_of_work: payload.location_of_work,
      date_commencement: payload.date_commencement,
      date_completion: payload.date_completion,
      description: payload.description,

      hazard_types: payload.hazard_types,
      other_hazard_text: payload.other_hazard_text || null,

      contractor: payload.contractor || "",

      contractor_company: payload.contractor_company || null,
      contractor_supervisor_name:
        payload.contractor_supervisor_name || null,
      contractor_supervisor_registration_no:
        payload.contractor_supervisor_registration_no || null,
      worker_briefing_acknowledged:
        payload.worker_briefing_acknowledged ?? false,
      top_controls_summary: payload.top_controls_summary || null,

      applicant_id: auth.user.id,
    })
    .select("id, serial_no")
    .single();

  if (insert.error || !insert.data) {
    return NextResponse.json(
      { error: insert.error?.message ?? "Failed to create permit" },
      { status: 500 },
    );
  }

  await supabase.rpc("write_audit", {
    p_permit_id: insert.data.id,
    p_action: isGuestApplicant ? "created_by_guest_applicant" : "created",
    p_from: null,
    p_to: "draft",
    p_reason: null,
    p_metadata: {
      actor_role: currentUser.role,
      company_id: payload.company_id,
      site_id: payload.site_id,

      display_applicant_name: payload.display_applicant_name || null,
      display_applicant_department:
        payload.display_applicant_department || null,

      hazard_types: payload.hazard_types,
      other_hazard_text: payload.other_hazard_text || null,

      contractor_company: payload.contractor_company || null,
      contractor_supervisor_name:
        payload.contractor_supervisor_name || null,
      contractor_supervisor_registration_no:
        payload.contractor_supervisor_registration_no || null,
      worker_briefing_acknowledged:
        payload.worker_briefing_acknowledged ?? false,
      top_controls_summary: payload.top_controls_summary || null,
    },
  });

  return NextResponse.json(insert.data, { status: 201 });
}