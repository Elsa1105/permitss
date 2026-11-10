import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkEmailSetup, sendEmailNotification } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: actor } = await supabase
    .from("users")
    .select("id, email, role, active")
    .eq("id", auth.user.id)
    .single();

  if (!actor || actor.role !== "admin" || !actor.active) {
    return { error: NextResponse.json({ error: "Admin role required" }, { status: 403 }) };
  }
  return { actor };
}

/** GET /api/admin/email-check -> which SMTP settings exist + does the SMTP login work. */
export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  return NextResponse.json(await checkEmailSetup());
}

/** POST /api/admin/email-check  { "to": "optional@address" } -> sends a real test email. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = body.to?.trim() || guard.actor.email;

  const result = await sendEmailNotification({
    to,
    subject: "[ePermit] Test email",
    html: "<p>This is a test email from the Franklin ePermit app. If you can read this, SMTP is working.</p>",
    text: "This is a test email from the Franklin ePermit app. If you can read this, SMTP is working.",
  });

  const failed = "error" in result || ("skipped" in result && result.skipped);
  return NextResponse.json({ to, ok: !failed, result: "error" in result ? String((result.error as Error)?.message ?? result.error) : result }, { status: failed ? 502 : 200 });
}
