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