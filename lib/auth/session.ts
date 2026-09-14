import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { UserRole, UserRow } from "@/lib/supabase/types";

export async function getCurrentUser(): Promise<UserRow | null> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: row } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!row) {
    return {
      id: user.id,
      email: user.email ?? "",
      role: "applicant",
      active: true,
    } as UserRow;
  }

  return row as UserRow;
}

export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (!user.active) redirect("/login?inactive=1");

  return user;
}

export async function requireRole(roles: UserRole[]): Promise<UserRow> {
  const user = await requireUser();

  if (!roles.includes(user.role) && user.role !== "admin") {
    redirect("/dashboard?unauthorized=1");
  }

  return user;
}

export async function requireAdmin(): Promise<UserRow> {
  return requireRole(["admin"]);
}