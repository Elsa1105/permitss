import { requireAdmin } from "@/lib/auth/session";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: number;
  permit_id: string | null;
  actor_id: string | null;
  action: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  ts: string;
  permit: { serial_no: string } | null;
  actor: { full_name: string; email: string } | null;
  permit_serial_snapshot: string | null;
  actor_name_snapshot: string | null;
  actor_email_snapshot: string | null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ permit?: string; actor?: string; limit?: string }>;
}) {
  await requireAdmin();
  // Admin is verified above. Service role reads historical joins even if RLS hides archived permits.
  const supabase = createServiceRoleSupabase();
  const sp = await searchParams;
  const limit = Math.min(Number(sp.limit ?? 200), 500);

  let q = supabase
    .from("audit_log")
    .select(
      "id, permit_id, actor_id, action, from_state, to_state, reason, ts, permit_serial_snapshot, actor_name_snapshot, actor_email_snapshot, permit:permit_id(serial_no), actor:actor_id(full_name, email)",
    )
    .order("ts", { ascending: false })
    .limit(limit);
  if (sp.permit) q = q.eq("permit_id", sp.permit);
  if (sp.actor) q = q.eq("actor_id", sp.actor);
  const { data, error } = await q;
  if (error) throw new Error(`Unable to load audit history: ${error.message}`);
  const rows = (data ?? []) as unknown as AuditRow[];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Append-only — every state transition with actor, timestamp, and reason.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/admin/audit/export?format=csv"
            className="btn-secondary"
            download
          >
            Export CSV
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent ({rows.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Permit</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>State change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(r.ts)}
                    </td>
                    <td className="font-mono text-xs">
                      {r.permit_serial_snapshot ?? r.permit?.serial_no ?? (r.permit_id ? `ID: ${r.permit_id.slice(0, 8)}` : "—")}
                    </td>
                    <td className="text-sm">
                      <div>{r.actor_name_snapshot ?? r.actor?.full_name ?? (r.actor_id ? `ID: ${r.actor_id.slice(0, 8)}` : "—")}</div>
                      <div className="text-xs text-slate-500">{r.actor_email_snapshot ?? r.actor?.email ?? ""}</div>
                    </td>
                    <td>
                      <Badge tone={badgeTone(r.action)}>{r.action}</Badge>
                    </td>
                    <td className="text-xs text-slate-600">
                      {r.from_state ?? "—"} → {r.to_state ?? "—"}
                    </td>
                    <td className="text-sm text-slate-600 max-w-md truncate">
                      {r.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function badgeTone(
  action: string,
): "neutral" | "info" | "warn" | "ok" | "bad" {
  if (
    action.includes("approved") ||
    action.includes("fit") ||
    action === "endorsed_continue" ||
    action === "closed" ||
    action === "user_activated" ||
    action === "document_added" ||
    action === "photo_added"
  ) {
    return "ok";
  }

  if (
    action.includes("reject") ||
    action.includes("revoke") ||
    action === "not_fit" ||
    action === "user_deactivated" ||
    action === "document_removed" ||
    action === "photo_removed"
  ) {
    return "bad";
  }

  if (
    action === "submitted" ||
    action === "permit_updated" ||
    action === "user_updated" ||
    action === "user_site_role_updated"
  ) {
    return "warn";
  }

  return "info";
}
