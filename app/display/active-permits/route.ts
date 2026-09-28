import { NextResponse } from "next/server";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";
import {
  effectivePermitState,
  groupEndorsedDays,
} from "@/lib/permits/effective-state";


const ACTIVE_STATES = [
  "approved_active",
  "pending_daily_endorsement",
  "pending_closure",
];

export async function GET() {
const supabase = await createServerSupabase();

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
        name,
        company:company_id (
          code,
          name
        )
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

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    state: string;
    date_commencement: string;
    date_completion: string;
  }>;

  const { data: endorsementRows } = rows.length
    ? await createServiceRoleSupabase()
        .from("permit_endorsements")
        .select("permit_id, day_number")
        .in(
          "permit_id",
          rows.map((r) => r.id),
        )
    : { data: [] };

  const endorsedByPermit = groupEndorsedDays(endorsementRows);

  const permits = rows.map((r) => ({
    ...r,
    state: effectivePermitState(
      r as never,
      endorsedByPermit.get(r.id) ?? [],
    ),
  }));

  return NextResponse.json({
    permits,
    generated_at: new Date().toISOString(),
  });
}