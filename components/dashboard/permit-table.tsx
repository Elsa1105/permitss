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

      {/* Mobile / narrow screens: card list, no horizontal scrolling needed */}
      <div className="divide-y divide-slate-200 lg:hidden">
        {visiblePermits.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No permits match your search.
          </p>
        ) : (
          visiblePermits.map(({ permit: p, companySite, applicant }) => (
            <Link
              key={p.id}
              href={`/permits/${p.id}`}
              className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-slate-50/60"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-700">
                    {p.serial_no}
                  </span>
                  <PermitStatusBadge state={p.state} />
                </div>

                <div className="font-medium text-slate-900">
                  {p.vessel_project || "—"}
                </div>

                <div className="text-xs text-slate-500">
                  {companySite}
                  {p.location_of_work ? ` · ${p.location_of_work}` : ""}
                </div>

                <div className="text-xs text-slate-500">
                  {applicant}
                  {p.job_type ? ` · ${p.job_type}` : ""}
                </div>

                <div className="text-xs text-slate-400">
                  {formatDate(p.date_commencement)} →{" "}
                  {formatDate(p.date_completion)}
                </div>
              </div>

              <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-400" />
            </Link>
          ))
        )}
      </div>

      {/* Desktop / wide screens: full sortable table, low-priority columns
          progressively hidden below xl so it fits without side-scrolling
          on typical laptop widths. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="table-base">
          <thead>
            <tr>
              <SortableHeader
                label="Serial No."
                sortKey="serial_no"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Job Type"
                sortKey="job_type"
                sort={sort}
                onSort={toggleSort}
                className="hidden xl:table-cell"
              />
              <SortableHeader
                label="Company / Site"
                sortKey="company_site"
                sort={sort}
                onSort={toggleSort}
                className="hidden xl:table-cell"
              />
              <SortableHeader
                label="Vessel / Project"
                sortKey="vessel_project"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Location"
                sortKey="location_of_work"
                sort={sort}
                onSort={toggleSort}
                className="hidden 2xl:table-cell"
              />
              <SortableHeader
                label="Applicant Name"
                sortKey="applicant"
                sort={sort}
                onSort={toggleSort}
                className="hidden 2xl:table-cell"
              />
              <SortableHeader
                label="Dates"
                sortKey="date_commencement"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Status"
                sortKey="state"
                sort={sort}
                onSort={toggleSort}
              />
              <th aria-label="Actions" />
            </tr>
          </thead>

          <tbody>
            {visiblePermits.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  No permits match your search.
                </td>
              </tr>
            ) : (
              visiblePermits.map(({ permit: p, companySite, applicant }) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="font-mono text-xs text-slate-700">
                    {p.serial_no}
                  </td>

                  <td className="hidden font-medium whitespace-nowrap xl:table-cell">
                    {p.job_type || "—"}
                  </td>

                  <td className="hidden text-xs text-slate-600 whitespace-nowrap xl:table-cell">
                    {companySite}
                  </td>

                  <td className="font-medium">{p.vessel_project}</td>

                  <td className="hidden text-slate-600 2xl:table-cell">
                    {p.location_of_work}
                  </td>

                  <td className="hidden text-slate-600 2xl:table-cell">
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const ariaSort = !active
    ? "none"
    : sort.direction === "asc"
      ? "ascending"
      : "descending";

  return (
    <th aria-sort={ariaSort} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-left hover:text-slate-950"
        title={`Sort by ${label}`}
      >
        {label}
        {active ? (
          sort.direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>
    </th>
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
