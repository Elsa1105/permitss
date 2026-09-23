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

  let recreated = false;

  if (updateError) {
    // "User not found" here means the `users` profile row (id = {id}) has
    // no matching Supabase Auth account anymore — e.g. it was removed
    // directly in the Supabase dashboard, or from some other flow outside
    // this app. That leaves the profile orphaned: it still shows up
    // everywhere the profile is listed, the person can no longer log in
    // ("everything looks fine" but sign-in fails), and re-adding them as a
    // brand-new user fails too, because the users.email uniqueness check
    // still sees this row. Recreate the Auth account using the SAME id so
    // every existing reference (permits raised, site roles, audit log)
    // still resolves to this one profile row instead of orphaning it
    // again or creating a duplicate.
    const notFound =
      updateError.status === 404 ||
      /user not found/i.test(updateError.message);

    if (!notFound) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { data: target, error: targetError } = await admin
      .from("users")
      .select("id, email")
      .eq("id", id)
      .single();

    if (targetError || !target) {
      return NextResponse.json(
        { error: "Target user not found" },
        { status: 404 },
      );
    }

    const { error: createError } = await admin.auth.admin.createUser({
      id: target.id,
      email: target.email,
      password: parsed.data.password,
      email_confirm: true,
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    recreated = true;
  }

  // Either way, an admin just set this password on the user's behalf —
  // require them to choose their own before continuing.
  await admin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", id);

  await admin.rpc("write_audit", {
    p_permit_id: null,
    p_action: recreated ? "user_login_recreated" : "user_password_reset",
    p_from: null,
    p_to: null,
    p_reason: null,
    p_metadata: {
      target_user_id: id,
      reset_by: auth.user.id,
    },
  });

  return NextResponse.json({ success: true, recreated });
}
