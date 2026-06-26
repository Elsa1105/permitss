import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: actor } = await supabase
    .from("users")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (actor?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("permits")
    .select(
      "serial_no, permit_type, state, vessel_project, location_of_work, date_commencement, date_completion, hazard_types, contractor, created_at, applicant:applicant_id(full_name, email), assessor:assessor_id(full_name), srm:srm_id(full_name), closer:closer_id(full_name)",
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<{
    serial_no: string;
    permit_type: string;
    state: string;
    vessel_project: string;
    location_of_work: string;
    date_commencement: string;
    date_completion: string;
    hazard_types: string[];
    contractor: string;
    created_at: string;
    applicant: { full_name: string; email: string } | null;
    assessor: { full_name: string } | null;
    srm: { full_name: string } | null;
    closer: { full_name: string } | null;
  }>;

  const header = [
    "serial_no",
    "type",
    "state",
    "vessel_project",
    "location_of_work",
    "date_commencement",
    "date_completion",
    "hazards",
    "contractor",
    "applicant",
    "assessor",
    "srm",
    "closer",
    "created_at",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.serial_no,
        r.permit_type,
        r.state,
        r.vessel_project,
        r.location_of_work,
        r.date_commencement,
        r.date_completion,
        r.hazard_types.join("|"),
        r.contractor,
        r.applicant?.full_name ?? "",
        r.assessor?.full_name ?? "",
        r.srm?.full_name ?? "",
        r.closer?.full_name ?? "",
        r.created_at,
      ]
        .map((c) => csvCell(String(c ?? "")))
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="permits-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
