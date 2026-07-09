import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { formatDate } from "@/lib/utils";
import type { PermitWithJoins } from "@/lib/supabase/types";

type PermitTableRow = PermitWithJoins & {
  display_applicant_name?: string | null;
  display_applicant_department?: string | null;
  company?: {
    id: string;
    code: string;
    name: string;
  } | null;
  site?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

export function PermitTable({ permits }: { permits: PermitWithJoins[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Serial No.</th>
            <th>Company / Site</th>
            <th>Vessel / Project</th>
            <th>Location</th>
            <th>Applicant</th>
            <th>Dates</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>

        <tbody>
          {permits.map((permit) => {
            const p = permit as PermitTableRow;

            const companySite =
              p.company && p.site
                ? `${p.company.code} / ${p.site.code} - ${p.site.name}`
                : p.company
                  ? `${p.company.code} - ${p.company.name}`
                  : p.site
                    ? `${p.site.code} - ${p.site.name}`
                    : "—";

            const applicant =
              p.display_applicant_name ||
              p.applicant?.full_name ||
              "—";

            return (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="font-mono text-xs text-slate-700">
                  {p.serial_no}
                </td>

                <td className="text-xs text-slate-600 whitespace-nowrap">
                  {companySite}
                </td>

                <td className="font-medium">{p.vessel_project}</td>

                <td className="text-slate-600">{p.location_of_work}</td>

                <td className="text-slate-600">
                  <div>{applicant}</div>
                  {p.display_applicant_department ? (
                    <div className="text-xs text-slate-400">
                      {p.display_applicant_department}
                    </div>
                  ) : null}
                </td>

                <td className="text-xs text-slate-500 whitespace-nowrap">
                  {formatDate(p.date_commencement)} →{" "}
                  {formatDate(p.date_completion)}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}