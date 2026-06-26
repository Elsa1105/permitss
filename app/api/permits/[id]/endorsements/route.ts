import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { EndorsementSchema } from "@/lib/permits/schemas";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const parsed = EndorsementSchema.safeParse({
    day_number: Number(raw?.day),
    action: raw?.action,
    remarks: raw?.remarks ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("permit_endorse_day", {
    p_permit_id: id,
    p_day: parsed.data.day_number,
    p_action: parsed.data.action,
    p_remarks: parsed.data.remarks ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
