"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { formatDate } from "@/lib/utils";
import type { PermitWithJoins } from "@/lib/supabase/types";

type PermitTableRow = PermitWithJoins & {
  job_type?: string | null;
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

type SortKey =
  | "serial_no"
  | "job_type"
  | "company_site"
  | "vessel_project"
  | "location_of_work"
  | "applicant"
  | "date_commencement"
  | "state";

type SortDirection = "asc" | "desc";

type SortState = {
  key: SortKey;
  direction: SortDirection;
} | null;

interface PermitTableProps {
  permits: PermitWithJoins[];
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function PermitTable({
  permits,
  searchable = false,
  searchPlaceholder =
    "Search by serial, job type, vessel, location, applicant, or status",
}: PermitTableProps) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortState>(null);

  const visiblePermits = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const rows = permits.map((permit, index) => {
      const p = permit as PermitTableRow;
      const companySite = formatCompanySite(p);
      const applicant = formatApplicant(p);

      return {
        permit: p,
        originalIndex: index,
        companySite,
        applicant,
        searchText: [
          p.serial_no,
          p.job_type,
          companySite,
          p.vessel_project,
          p.location_of_work,
          applicant,
          p.display_applicant_department,
          p.date_commencement,
          p.date_completion,
          p.state,
          p.state.replaceAll("_", " "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      };
    });

    const filtered = normalizedQuery
      ? rows.filter((row) => row.searchText.includes(normalizedQuery))
      : rows;

    if (!sort) {
      return filtered.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    return filtered.sort((a, b) => {
      const left = sortValue(a.permit, sort.key, a.companySite, a.applicant);
      const right = sortValue(b.permit, sort.key, b.companySite, b.applicant);
      const compared = left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      if (compared === 0) {
        return a.originalIndex - b.originalIndex;
      }

      return sort.direction === "asc" ? compared : -compared;
    });
  }, [permits, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }

      return null;
    });
  }

  return (
    <div>
      {searchable ? (
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <label className="relative block max-w-xl">
            <span className="sr-only">Search permits</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="input w-full pl-9 pr-10"
            />

            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                aria-label="Clear permit search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <p className="mt-1.5 text-xs text-slate-500">
            {visiblePermits.length} of {permits.length} permit
            {permits.length === 1 ? "" : "s"} shown.
          </p>
        </div>
      ) : null}

      {/*
        SINGLE LAYOUT FOR ALL SCREEN SIZES — this is a row list, not a wide
        <table>. It never needs horizontal scrolling because it never lays
        columns out side by side beyond what fits: only 3 fixed columns
        (identity block, dates, status/action), and the identity block
        wraps everything else (serial no, job type, company/site, vessel,
        location, applicant) as stacked text inside itself.
      */}
      <div className="border-t border-slate-200">
        {/* Sort bar - compact, wraps on small screens instead of forcing scroll */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
          <SortChip label="Serial" sortKey="serial_no" sort={sort} onSort={toggleSort} />
          <SortChip label="Job Type" sortKey="job_type" sort={sort} onSort={toggleSort} />
          <SortChip label="Company/Site" sortKey="company_site" sort={sort} onSort={toggleSort} />
          <SortChip label="Vessel/Project" sortKey="vessel_project" sort={sort} onSort={toggleSort} />
          <SortChip label="Location" sortKey="location_of_work" sort={sort} onSort={toggleSort} />
          <SortChip label="Applicant" sortKey="applicant" sort={sort} onSort={toggleSort} />
          <SortChip label="Dates" sortKey="date_commencement" sort={sort} onSort={toggleSort} />
          <SortChip label="Status" sortKey="state" sort={sort} onSort={toggleSort} />
        </div>

        {visiblePermits.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No permits match your search.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {visiblePermits.map(({ permit: p, companySite, applicant }) => (
              <Link
                key={p.id}
                href={`/permits/${p.id}`}
                className="grid grid-cols-1 gap-2 px-3 py-3 hover:bg-slate-50/60 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4"
              >
                {/* Identity block: everything that used to be 6 separate
                    columns now stacks here, so it never pushes the row
                    wider than the container. */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-slate-500">
                      {p.serial_no}
                    </span>
                    {p.job_type ? (
                      <span className="text-xs text-slate-400">
                        · {p.job_type}
                      </span>
                    ) : null}
                  </div>

                  <div className="truncate font-medium text-slate-900">
                    {p.vessel_project || "—"}
                  </div>

                  <div className="truncate text-xs text-slate-500">
                    {companySite}
                    {p.location_of_work ? ` · ${p.location_of_work}` : ""}
                  </div>

                  <div className="truncate text-xs text-slate-500">
                    {applicant}
                    {p.display_applicant_department
                      ? ` · ${p.display_applicant_department}`
                      : ""}
                  </div>
                </div>

                <div className="text-xs text-slate-500 sm:whitespace-nowrap sm:text-right">
                  {formatDate(p.date_commencement)} →{" "}
                  {formatDate(p.date_completion)}
                </div>

                <div className="sm:justify-self-start">
                  <PermitStatusBadge state={p.state} />
                </div>

                <div className="flex items-center justify-end gap-1 text-sm font-medium text-blue-600">
                  Open <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SortChip({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-slate-950 ${
        active ? "font-semibold text-slate-950" : "text-slate-500"
      }`}
      title={`Sort by ${label}`}
    >
      {label}
      {active ? (
        sort!.direction === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 text-slate-300" />
      )}
    </button>
  );
}

function formatCompanySite(p: PermitTableRow) {
  if (p.company && p.site) {
    return `${p.company.code} / ${p.site.code} - ${p.site.name}`;
  }

  if (p.company) {
    return `${p.company.code} - ${p.company.name}`;
  }

  if (p.site) {
    return `${p.site.code} - ${p.site.name}`;
  }

  return "—";
}

function formatApplicant(p: PermitTableRow) {
  return p.display_applicant_name || p.applicant?.full_name || "—";
}

function sortValue(
  permit: PermitTableRow,
  key: SortKey,
  companySite: string,
  applicant: string,
) {
  switch (key) {
    case "serial_no":
      return permit.serial_no || "";
    case "job_type":
      return permit.job_type || "";
    case "company_site":
      return companySite;
    case "vessel_project":
      return permit.vessel_project || "";
    case "location_of_work":
      return permit.location_of_work || "";
    case "applicant":
      return applicant;
    case "date_commencement":
      return permit.date_commencement || "";
    case "state":
      return permit.state || "";
  }
}
