import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";

const ACTIVE_STATES = [
  "approved_active",
  "pending_daily_endorsement",
  "pending_closure",
];

export async function GET() {
  // This board is meant to run unattended (a TV in reception/site office),
  // so there's no logged-in session here — createServerSupabase() (the
  // cookie/session-bound client) would hit RLS as an anonymous visitor
  // and come back empty. Use the service-role client instead, same as
  // the public QR permit page, and keep the select() below limited to
  // non-sensitive fields only (no remarks, signatures, or documents).
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

  return NextResponse.json({
    permits: data ?? [],
    generated_at: new Date().toISOString(),
  });
}
