import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: actor } = await supabase
    .from("users")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (actor?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 5000), 50000);

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, ts, action, from_state, to_state, reason, permit:permit_id(serial_no), actor:actor_id(email, full_name)",
    )
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<{
    id: number;
    ts: string;
    action: string;
    from_state: string | null;
    to_state: string | null;
    reason: string | null;
    permit: { serial_no: string } | null;
    actor: { email: string; full_name: string } | null;
  }>;

  const lines = [
    ["id", "timestamp", "permit_serial", "actor_email", "actor_name", "action", "from_state", "to_state", "reason"]
      .map(csvCell)
      .join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.ts,
        r.permit?.serial_no ?? "",
        r.actor?.email ?? "",
        r.actor?.full_name ?? "",
        r.action,
        r.from_state ?? "",
        r.to_state ?? "",
        r.reason ?? "",
      ]
        .map((c) => csvCell(String(c)))
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
