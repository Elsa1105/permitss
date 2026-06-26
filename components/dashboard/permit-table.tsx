import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { formatDate } from "@/lib/utils";
import type { PermitWithJoins } from "@/lib/supabase/types";

export function PermitTable({ permits }: { permits: PermitWithJoins[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Serial No.</th>
            <th>Vessel / Project</th>
            <th>Location</th>
            <th>Applicant</th>
            <th>Dates</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {permits.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50/60">
              <td className="font-mono text-xs text-slate-700">{p.serial_no}</td>
              <td className="font-medium">{p.vessel_project}</td>
              <td className="text-slate-600">{p.location_of_work}</td>
              <td className="text-slate-600">{p.applicant?.full_name ?? "—"}</td>
              <td className="text-xs text-slate-500 whitespace-nowrap">
                {formatDate(p.date_commencement)} → {formatDate(p.date_completion)}
              </td>
              <td>
                <PermitStatusBadge state={p.state} />
              </td>
              <td className="text-right">
                <Link
                  href={`/permits/${p.id}`}
                  className="inline-flex items-center text-blue-600 hover:underline text-sm"
                >
                  Open <ChevronRight className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
