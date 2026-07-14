import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";

const ACTIVE_STATES = [
  "approved_active",
  "pending_daily_endorsement",
  "pending_closure",
];

export async function GET() {
  const supabase = createServiceRoleSupabase();

  const { data, error } = await supabase
    .from("permits")
    .select(
      `
        id,
        serial_no,
        state,
        job_type,
        vessel_project,
        location_of_work,
        date_commencement,
        date_completion,
        description,
        hazard_types,
        other_hazard_text,
        company:company_id (
          code,
          name
        ),
        site:site_id (
          code,
          name
        )
      `,
    )
    .in("state", ACTIVE_STATES)
    .order("date_completion", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    permits: data ?? [],
    generated_at: new Date().toISOString(),
  });
}