import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  department: z.string().nullable().optional(),
  role: z.enum([
    "applicant",
    "guest_applicant",
    "contractor",
    "assessor",
    "srm",
    "admin",
  ]),
  qualified_for: z.array(z.string()).optional().default([]),
  active: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
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

  const parsed = CreateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const admin = createServiceRoleSupabase();

  const { data: existingProfile } = await admin
    .from("users")
    .select("id")
    .eq("email", payload.email)
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json(
      { error: "User with this email already exists" },
      { status: 400 },
    );
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.full_name,
        department: payload.department ?? null,
        role: payload.role,
      },
    });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create auth user" },
      { status: 400 },
    );
  }

  const { data: userRow, error: profileError } = await admin
    .from("users")
    .upsert(
      {
        id: created.user.id,
        email: payload.email,
        full_name: payload.full_name,
        department: payload.department ?? null,
        role: payload.role,
        qualified_for: payload.qualified_for,
        active: payload.active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 400 },
    );
  }

  await admin.rpc("write_audit", {
    p_permit_id: null,
    p_action: "user_created",
    p_from: null,
    p_to: null,
    p_reason: null,
    p_metadata: {
      target_user_id: created.user.id,
      target_user_email: payload.email,
      role: payload.role,
      active: payload.active,
      qualified_for: payload.qualified_for,
      created_by: auth.user.id,
    },
  });

  return NextResponse.json(userRow, { status: 201 });
}