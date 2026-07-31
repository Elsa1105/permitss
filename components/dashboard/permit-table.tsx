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
  | "location_of_work"
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

      // Applicant and Vessel/Project are intentionally NOT displayed
      // in the table, but remain searchable through this combined text.
      const searchText = [
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
        .toLowerCase();

      return {
        permit: p,
        originalIndex: index,
        companySite,
        searchText,
      };
    });

    const filtered = normalizedQuery
      ? rows.filter((row) => row.searchText.includes(normalizedQuery))
      : rows;

    if (!sort) {
      return [...filtered].sort(
        (a, b) => a.originalIndex - b.originalIndex,
      );
    }

    return [...filtered].sort((a, b) => {
      const left = sortValue(a.permit, sort.key, a.companySite);
      const right = sortValue(b.permit, sort.key, b.companySite);
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

      <div className="overflow-x-auto border-t border-slate-200">
        {visiblePermits.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No permits match your search.
          </p>
        ) : (
          <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
            </colgroup>

            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs">
                <Th
                  label="Serial"
                  sortKey="serial_no"
                  sort={sort}
                  onSort={toggleSort}
                />
                <Th
                  label="Job Type"
                  sortKey="job_type"
                  sort={sort}
                  onSort={toggleSort}
                />
                <Th
                  label="Company/Site"
                  sortKey="company_site"
                  sort={sort}
                  onSort={toggleSort}
                />
                <Th
                  label="Location"
                  sortKey="location_of_work"
                  sort={sort}
                  onSort={toggleSort}
                />
                <Th
                  label="Dates"
                  sortKey="date_commencement"
                  sort={sort}
                  onSort={toggleSort}
                />
                <Th
                  label="Status"
                  sortKey="state"
                  sort={sort}
                  onSort={toggleSort}
                />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {visiblePermits.map(({ permit: p, companySite }) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-slate-50/60"
                  onClick={() => {
                    window.location.href = `/permits/${p.id}`;
                  }}
                >
                  <td className="whitespace-nowrap px-3 py-3 align-middle font-mono text-xs text-slate-500">
                    {p.serial_no}
                  </td>

                  <td className="px-3 py-3 align-middle font-medium text-slate-900">
                    {p.job_type || "—"}
                  </td>

                  <td className="px-3 py-3 align-middle text-slate-600">
                    <span className="block truncate" title={companySite}>
                      {companySite}
                    </span>
                  </td>

                  <td className="px-3 py-3 align-middle text-slate-600">
                    <span
                      className="block truncate"
                      title={p.location_of_work || ""}
                    >
                      {p.location_of_work || "—"}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 align-middle text-xs text-slate-500">
                    {formatDate(p.date_commencement)} →{" "}
                    {formatDate(p.date_completion)}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <PermitStatusBadge state={p.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Th({
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
    <th className="px-3 py-2 text-left font-normal">
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

function sortValue(permit: PermitTableRow, key: SortKey, companySite: string) {
  switch (key) {
    case "serial_no":
      return permit.serial_no || "";
    case "job_type":
      return permit.job_type || "";
    case "company_site":
      return companySite;
    case "location_of_work":
      return permit.location_of_work || "";
    case "date_commencement":
      return permit.date_commencement || "";
    case "state":
      return permit.state || "";
  }
}