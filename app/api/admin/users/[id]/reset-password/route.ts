import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";

const BodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

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

  // Same admin check used by the other /api/admin/users/[id] route.
  const { data: actor, error: actorError } = await supabase
    .from("users")
    .select("id, role, active")
    .eq("id", auth.user.id)
    .single();

  if (actorError || !actor || actor.role !== "admin" || !actor.active) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid password" },
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();

  // Requires SUPABASE_SERVICE_ROLE_KEY — this bypasses normal auth and can
  // set any user's password directly, so it must stay server-only and
  // admin-gated (checked above).
  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    password: parsed.data.password,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await admin.rpc("write_audit", {
    p_permit_id: null,
    p_action: "user_password_reset",
    p_from: null,
    p_to: null,
    p_reason: null,
    p_metadata: {
      target_user_id: id,
      reset_by: auth.user.id,
    },
  });

  return NextResponse.json({ success: true });
}
