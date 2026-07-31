"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { PermitTable } from "@/components/dashboard/permit-table";
import { STATE_LABEL } from "@/lib/permits/state-machine";
import type { PermitWithJoins } from "@/lib/supabase/types";

type PermitRow = PermitWithJoins & {
  job_type?: string | null;
  vessel_project?: string | null;
  display_applicant_name?: string | null;
  applicant?: { full_name?: string | null } | null;
  company?: { code: string; name: string } | null;
  site?: { code: string; name: string } | null;
};

type DateFilter = "all" | "today" | "this_week" | "this_month";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
];

interface PermitsExplorerProps {
  permits: PermitWithJoins[];
}

export function PermitsExplorer({ permits }: PermitsExplorerProps) {
  const [query, setQuery] = React.useState("");
  const [jobType, setJobType] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [dateFilter, setDateFilter] = React.useState<DateFilter>("all");
  const [applicantVessel, setApplicantVessel] = React.useState("");

  const jobTypeOptions = React.useMemo(() => {
    const unique = new Set<string>();
    for (const p of permits as PermitRow[]) {
      if (p.job_type) unique.add(p.job_type);
    }
    return [
      { value: "all", label: "All Job Types" },
      ...Array.from(unique)
        .sort((a, b) => a.localeCompare(b))
        .map((jt) => ({ value: jt, label: jt })),
    ];
  }, [permits]);

  const statusOptions = React.useMemo(() => {
    const present = new Set((permits as PermitRow[]).map((p) => p.state));
    return [
      { value: "all", label: "All Statuses" },
      ...Object.entries(STATE_LABEL)
        .filter(([value]) => present.has(value as never))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [permits]);

  const filteredPermits = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedApplicantVessel = applicantVessel.trim().toLowerCase();

    return (permits as PermitRow[]).filter((p) => {
      // Job Type
      if (jobType !== "all" && p.job_type !== jobType) return false;

      // Status
      if (status !== "all" && p.state !== status) return false;

      // Date
      if (dateFilter !== "all" && !matchesDateFilter(p.date_commencement, p.date_completion, dateFilter)) {
        return false;
      }

      // General search (serial, job type, company/site, location, dates, status)
      if (normalizedQuery) {
        const companySite = formatCompanySite(p);
        const haystack = [
          p.serial_no,
          p.job_type,
          companySite,
          p.location_of_work,
          p.date_commencement,
          p.date_completion,
          p.state,
          p.state?.replaceAll("_", " "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedQuery)) return false;
      }

      // Applicant / Vessel search
      if (normalizedApplicantVessel) {
        const applicant = (
          p.display_applicant_name ||
          p.applicant?.full_name ||
          ""
        ).toLowerCase();
        const vessel = (p.vessel_project || "").toLowerCase();

        if (
          !applicant.includes(normalizedApplicantVessel) &&
          !vessel.includes(normalizedApplicantVessel)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [permits, query, jobType, status, dateFilter, applicantVessel]);

  const hasActiveFilters =
    query || jobType !== "all" || status !== "all" || dateFilter !== "all" || applicantVessel;

  return (
    <div className="w-full">
      {/* FILTER BAR */}
      <div className="border-b border-slate-200 bg-slate-50/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search permits</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="input w-full pl-9"
            />
          </label>

          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="input w-auto min-w-[140px]"
          >
            {jobTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input w-auto min-w-[160px]"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="input w-auto min-w-[130px]"
          >
            {DATE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search applicant or vessel</span>
            <input
              type="search"
              value={applicantVessel}
              onChange={(e) => setApplicantVessel(e.target.value)}
              placeholder="Applicant/Vessel Search..."
              className="input w-full"
            />
          </label>
        </div>

        <p className="mt-1.5 text-xs text-slate-500">
          {filteredPermits.length} of {permits.length} permits shown.
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setJobType("all");
                setStatus("all");
                setDateFilter("all");
                setApplicantVessel("");
              }}
              className="ml-2 font-medium text-slate-700 underline hover:text-slate-950"
            >
              Clear filters
            </button>
          ) : null}
        </p>
      </div>

      {/* TABLE */}
      {filteredPermits.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          No permits match your filters.
        </div>
      ) : (
        <PermitTable permits={filteredPermits} searchable={false} />
      )}
    </div>
  );
}

function formatCompanySite(p: PermitRow) {
  if (p.company && p.site) {
    return `${p.company.code} / ${p.site.code} - ${p.site.name}`;
  }
  if (p.company) return `${p.company.code} - ${p.company.name}`;
  if (p.site) return `${p.site.code} - ${p.site.name}`;
  return "—";
}

function matchesDateFilter(
  commencement: string | null | undefined,
  completion: string | null | undefined,
  filter: DateFilter,
) {
  if (!commencement && !completion) return false;

  const now = new Date();
  const start = commencement ? new Date(commencement) : null;
  const end = completion ? new Date(completion) : start;
  if (!start) return false;

  const rangeStart = new Date(start);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(end ?? start);
  rangeEnd.setHours(23, 59, 59, 999);

  if (filter === "today") {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    return rangeStart <= todayEnd && rangeEnd >= todayStart;
  }

  if (filter === "this_week") {
    const day = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return rangeStart <= weekEnd && rangeEnd >= weekStart;
  }

  if (filter === "this_month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return rangeStart <= monthEnd && rangeEnd >= monthStart;
  }

  return true;
}
