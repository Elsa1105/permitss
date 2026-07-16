import { notFound } from "next/navigation";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { PermitEndorsementRow, PermitStageRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type PublicPermit = {
  id: string;
  serial_no: string;
  state: string;
  permit_type: string;
  job_type: string | null;
  vessel_project: string;
  location_of_work: string;
  date_commencement: string;
  date_completion: string;
  description: string;
  hazard_types: string[];
  other_hazard_text: string | null;
  company: {
    code: string;
    name: string;
  } | null;
  site: {
    code: string;
    name: string;
  } | null;
};

export default async function PublicPermitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceRoleSupabase();

  const { data: permit, error } = await supabase
    .from("permits")
    .select(
      `
        id,
        serial_no,
        state,
        permit_type,
        job_type,
        vessel_project,
        location_of_work,
        date_commencement,
        date_completion,
        description,
        hazard_types,
        other_hazard_text,
        company:company_id (
          code,
          name
        ),
        site:site_id (
          code,
          name
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !permit) {
    notFound();
  }

  const p = permit as unknown as PublicPermit;

  const [{ data: endorsements }, { data: stages }] = await Promise.all([
    supabase
      .from("permit_endorsements")
      .select("*, endorser:endorser_id ( full_name )")
      .eq("permit_id", id)
      .order("day_number", { ascending: true }),
    supabase
      .from("permit_stages")
      .select("stage, submitted_at")
      .eq("permit_id", id)
      .order("submitted_at", { ascending: true }),
  ]);

  const endorsementRows = (endorsements ?? []) as unknown as PermitEndorsementRow[];
  const stageRows = (stages ?? []) as Pick<
    PermitStageRow,
    "stage" | "submitted_at"
  >[];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Franklin ePermit
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Live Hot Work Permit
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Public permit status display. This page only shows non-confidential
            permit information.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{p.serial_no}</CardTitle>

                <p className="mt-1 text-sm text-slate-500">
                  {p.company ? `${p.company.code} - ${p.company.name}` : "—"}
                  {p.site ? ` / ${p.site.code} - ${p.site.name}` : ""}
                </p>
              </div>

              <PermitStatusBadge state={p.state as never} />
            </div>
          </CardHeader>

          <CardBody className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Field label="Job Type" value={p.job_type} />
            <Field label="Vessel / Project" value={p.vessel_project} />
            <Field label="Location of Work" value={p.location_of_work} />

            <Field
              label="Valid From"
              value={formatDate(p.date_commencement)}
            />

            <Field label="Valid Until" value={formatDate(p.date_completion)} />

            <div className="sm:col-span-2">
              <Field label="Hazards" value={formatHazards(p)} />
            </div>

            <div className="sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Work Description
              </div>

              <p className="mt-1 whitespace-pre-wrap text-slate-900">
                {p.description || "—"}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Endorsed PDF Record</CardTitle>
              <a
                href={`/public/permits/${p.id}/pdf`}
                className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                View / Download PDF
              </a>
            </div>
          </CardHeader>

          <CardBody className="space-y-2 text-sm text-slate-700">
            <p>
              This link opens the full endorsed permit PDF — including every
              Stage approval date and Day 2–14 endorsement — for on-site
              verification. No login is required.
            </p>
          </CardBody>
        </Card>

        {stageRows.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Stage Approval Dates</CardTitle>
            </CardHeader>

            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {stageRows.map((s) => (
                  <div key={s.stage}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Stage {s.stage}
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {formatDateTime(s.submitted_at)}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {endorsementRows.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Day 2–14 Endorsements</CardTitle>
            </CardHeader>

            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-4">Day</th>
                    <th className="py-1 pr-4">Due date</th>
                    <th className="py-1 pr-4">Approval date</th>
                    <th className="py-1 pr-4">Action</th>
                    <th className="py-1 pr-4">Endorsed by</th>
                  </tr>
                </thead>
                <tbody>
                  {endorsementRows.map((e) => (
                    <tr key={e.day_number} className="border-t border-slate-100">
                      <td className="py-1.5 pr-4 font-medium text-slate-900">
                        Day {e.day_number}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-600">
                        {e.target_date ? formatDate(e.target_date) : "—"}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-600">
                        {formatDateTime(e.ts)}
                        {e.retrospective ? (
                          <span className="ml-2 inline-block rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            Retrospective
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-4 capitalize text-slate-600">
                        {e.action}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-600">
                        {e.endorser?.full_name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Permit Status Meaning</CardTitle>
          </CardHeader>

          <CardBody className="space-y-2 text-sm text-slate-700">
            <p>
              This page reflects the latest permit status from the ePermit
              database.
            </p>

            <p>
              If the permit is not in an approved or active state, hot work must
              not proceed based only on this QR page.
            </p>

            <p className="text-xs text-slate-500">
              Last refreshed when this page was opened. Refresh the browser to
              fetch the newest status.
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-medium text-slate-900">{value || "—"}</div>
    </div>
  );
}

function formatHazards(permit: PublicPermit) {
  if (!permit.hazard_types?.length) return "—";

  return permit.hazard_types
    .map((hazard) => {
      if (hazard === "other" && permit.other_hazard_text) {
        return `Other: ${permit.other_hazard_text}`;
      }

      return hazard
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    })
    .join(", ");
}
