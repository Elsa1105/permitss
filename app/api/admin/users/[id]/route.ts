import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";

const RoleSchema = z.enum([
  "applicant",
  "guest_applicant",
  "contractor",
  "assessor",
  "srm",
  "admin",
]);

const SiteRoleSchema = z.object({
  company_id: z.string().uuid(),
  site_id: z.string().uuid(),
  role: RoleSchema,
});

const PatchSchema = z.object({
  full_name: z.string().min(1).optional(),
  department: z.string().nullable().optional(),
  role: RoleSchema.optional(),
  qualified_for: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  site_roles: z.array(SiteRoleSchema).optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: actor, error: actorError } = await supabase
    .from("users")
    .select("id, role, active")
    .eq("id", auth.user.id)
    .single();

  if (actorError || !actor) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 403 },
    );
  }

  if (actor.role !== "admin" || !actor.active) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  const parsed = PatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const patch = parsed.data;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  if (id === auth.user.id && patch.active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own admin account" },
      { status: 400 },
    );
  }

  if (id === auth.user.id && patch.role && patch.role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role" },
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();

  const { data: target, error: targetError } = await admin
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (targetError || !target) {
    return NextResponse.json(
      { error: "Target user not found" },
      { status: 404 },
    );
  }

  const { site_roles: siteRoles, ...userPatch } = patch;

  let data = target;

  if (Object.keys(userPatch).length > 0) {
    const { data: updatedUser, error } = await admin
      .from("users")
      .update({
        ...userPatch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    data = updatedUser;
  }

  if (siteRoles) {
    const { error: deleteError } = await admin
      .from("user_site_roles")
      .delete()
      .eq("user_id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 400 },
      );
    }

    if (siteRoles.length > 0) {
      const { error: insertError } = await admin
        .from("user_site_roles")
        .upsert(
          siteRoles.map((siteRole) => ({
            user_id: id,
            company_id: siteRole.company_id,
            site_id: siteRole.site_id,
            role: siteRole.role,
            active: true,
          })),
          {
            onConflict: "user_id,company_id,site_id,role",
          },
        );

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 },
        );
      }
    }
  }

  await admin.rpc("write_audit", {
    p_permit_id: null,
    p_action:
      typeof patch.active === "boolean" && patch.active !== target.active
        ? patch.active
          ? "user_activated"
          : "user_deactivated"
        : "user_updated",
    p_from: null,
    p_to: null,
    p_reason: null,
    p_metadata: {
      target_user_id: id,
      previous_active: target.active,
      next_active: data.active,
      previous_role: target.role,
      next_role: data.role,
      site_roles_updated: Boolean(siteRoles),
      site_roles: siteRoles ?? null,
      updated_by: auth.user.id,
    },
  });

  return NextResponse.json(data);
}

// A test account may only be purged after a separate explicit DBA verification
// in the test_user_purge_approvals table. The RPC refuses any unapproved data.
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceRoleSupabase();
  const { data: actor } = await admin.from("users").select("id,role,active")
    .eq("id", auth.user.id).maybeSingle();
  if (!actor?.active || actor.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });
  if (id === auth.user.id) return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const confirmed = body?.confirmation === "DELETE TEST ACCOUNT";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!confirmed || reason.length < 10) return NextResponse.json({ error: "Type DELETE TEST ACCOUNT and supply a reason of at least 10 characters" }, { status: 400 });

  // Database transaction verifies approval, linked permit IDs and all FK references,
  // deletes approved test rows only, and journals the deletion. Never bypass it.
  const { data, error } = await admin.rpc("admin_purge_verified_test_user", {
    p_target_user_id: id,
    p_actor_id: auth.user.id,
    p_reason: reason,
  });
  // A user with no historical references can be removed from the Users button
  // without a separately issued DBA approval. The fallback RPC checks the
  // entire no-history condition in a database transaction and journals it.
  let journalId = data;
  if (error) {
    if (!error.message.includes("No valid independent test-data verification")) {
      return NextResponse.json({ error: error.message, code: error.code, can_deactivate: true }, { status: 409 });
    }
    const unused = await admin.rpc("admin_delete_unused_test_user", {
      p_target_user_id: id,
      p_actor_id: auth.user.id,
      p_reason: reason,
    });
    if (unused.error) {
      return NextResponse.json({
        error: "Account still has historical records or is not eligible for automatic deletion. Only genuinely unused test accounts can be deleted without independent review.",
        detail: unused.error.message,
        can_deactivate: true,
      }, { status: 409 });
    }
    journalId = unused.data;
  }

  // Auth Admin API is outside PostgreSQL transaction. If this fails, preserve
  // the durable journal and tell the operator to reconcile in Supabase Auth.
  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError && !/not found/i.test(authError.message)) {
    console.error("Test account profile purged; Auth cleanup required", { id, message: authError.message });
    return NextResponse.json({ error: "Database cleanup completed, but Auth removal failed. Reconcile the login in Supabase Auth.", journal_id: journalId }, { status: 502 });
  }
  return NextResponse.json({ ok: true, journal_id: journalId });
}
