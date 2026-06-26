import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { notifyPermitEvent } from "@/lib/notifications/permit-emails";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("permit_submit_stage4", {
    p_permit_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyPermitEvent({
    supabase,
    permitId: id,
    event: "stage4_closed",
  });

  return NextResponse.json(data);
}