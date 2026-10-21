import { NextResponse } from "next/server";
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server";

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: actor } = await supabase
    .from("users")
    .select("id,role,active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!actor?.active || actor.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (body?.confirmation !== "DELETE" || reason.length < 5) {
    return NextResponse.json(
      { error: "Type DELETE and provide a reason (at least 5 characters)" },
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();

  // The database transaction validates the state and inserts its audit row atomically.
  const { data, error } = await admin.rpc("admin_archive_draft_permit", {
    p_permit_id: id,
    p_actor_id: auth.user.id,
    p_reason: reason,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === "P0001" ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, archived_id: data });
}
