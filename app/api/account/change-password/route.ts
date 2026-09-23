import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";

const BodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Self-service password change, restored per UAT feedback ("Password
// change option not available, all password same"). Anyone signed in can
// set their own password here — no admin role required, unlike
// /api/admin/users/[id]/reset-password which is for an admin acting on
// someone else's account.
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid password" },
      { status: 400 },
    );
  }

  // Updates the CURRENT user's own password — this works with their own
  // session, no service role needed.
  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Clearing must_change_password goes through the service-role client
  // (not the user's own session) so we don't need a broad "users can
  // update their own row" RLS policy that could also let someone
  // self-update role/active/qualified_for.
  const admin = createServiceRoleSupabase();

  await admin
    .from("users")
    .update({ must_change_password: false })
    .eq("id", auth.user.id);

  await admin.rpc("write_audit", {
    p_permit_id: null,
    p_action: "user_password_reset",
    p_from: null,
    p_to: null,
    p_reason: null,
    p_metadata: {
      target_user_id: auth.user.id,
      reset_by: auth.user.id,
      self_service: true,
    },
  });

  return NextResponse.json({ success: true });
}
