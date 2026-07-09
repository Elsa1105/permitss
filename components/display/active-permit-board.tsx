"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { formatDate } from "@/lib/utils";

type DisplayPermit = {
  id: string;
  serial_no: string;
  state: string;
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

type ApiResponse = {
  permits: DisplayPermit[];
  generated_at: string;
};

export function ActivePermitBoard() {
  const [permits, setPermits] = React.useState<DisplayPermit[]>([]);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  async function loadPermits() {
    try {
      const res = await fetch("/api/display/active-permits", {
        cache: "no-store",
      });

      const body = (await res.json()) as ApiResponse | { error?: string };

      if (!res.ok) {
        setError("error" in body ? body.error ?? "Failed to load" : "Failed to load");
        return;
      }

      const okBody = body as ApiResponse;

      setPermits(okBody.permits);
      setGeneratedAt(okBody.generated_at);
      setError(null);
    } catch {
      setError("Failed to load active permits");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadPermits();

    const timer = window.setInterval(() => {
      void loadPermits();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const nowLabel = generatedAt
    ? new Date(generatedAt).toLocaleString()
    : "—";

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-300">
              Franklin ePermit
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Active Hot Work Permits
            </h1>

            <p className="mt-2 text-sm text-slate-300">
              Live display for production office / TV screen.
            </p>
          </div>

          <div className="text-right text-sm text-slate-300">
            <div>Auto-refresh every 60 seconds</div>
            <div>Last updated: {nowLabel}</div>

            <button
              type="button"
              onClick={() => void loadPermits()}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
            Loading active permits...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-8 text-center text-red-200">
            {error}
          </div>
        ) : permits.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
            <h2 className="text-2xl font-semibold">No active permits</h2>
            <p className="mt-2 text-slate-300">
              Active Hot Work Permits will appear here after SRM approval.
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {permits.map((permit) => (
              <PermitDisplayCard key={permit.id} permit={permit} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function PermitDisplayCard({ permit }: { permit: DisplayPermit }) {
  const companySite =
    permit.company && permit.site
      ? `${permit.company.code} / ${permit.site.code} - ${permit.site.name}`
      : permit.company
        ? `${permit.company.code} - ${permit.company.name}`
        : permit.site
          ? `${permit.site.code} - ${permit.site.name}`
          : "—";

  return (
    <article className="rounded-2xl border border-white/10 bg-white p-5 text-slate-950 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm text-slate-500">
            {permit.serial_no}
          </div>

          <h2 className="mt-1 text-2xl font-bold">{permit.vessel_project}</h2>

          <p className="mt-1 text-sm font-medium text-slate-600">
            {companySite}
          </p>
        </div>

        <PermitStatusBadge state={permit.state as never} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <Field label="Location" value={permit.location_of_work} />
        <Field
          label="Validity"
          value={`${formatDate(permit.date_commencement)} → ${formatDate(
            permit.date_completion,
          )}`}
        />

        <div className="sm:col-span-2">
          <Field label="Hazards" value={formatHazards(permit)} />
        </div>

        <div className="sm:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Work Description
          </div>
          <p className="mt-1 line-clamp-3 text-slate-900">
            {permit.description}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <Link
          href={`/public/permits/${permit.id}`}
          className="text-sm font-medium text-blue-700 hover:underline"
          target="_blank"
        >
          Open public live permit
        </Link>
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-medium text-slate-950">{value || "—"}</div>
    </div>
  );
}

function formatHazards(permit: DisplayPermit) {
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