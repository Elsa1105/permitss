"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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

  /*
   * Keep this search separate from your existing filters.
   * Parent-level filters still work normally.
   */
  searchable?: boolean;

  searchPlaceholder?: string;
}

export function PermitTable({
  permits,
  searchable = false,
  searchPlaceholder = "Search permits...",
}: PermitTableProps) {
  const [query, setQuery] = React.useState("");

  const [sort, setSort] =
    React.useState<SortState>(null);

  /*
  ============================================================
  SEARCH + SORT
  ============================================================

  The permits passed into this component have already been
  filtered by the existing filters.

  This component only:
  1. Searches
  2. Sorts
  3. Displays the table
  */

  const visiblePermits =
    React.useMemo(() => {
      const normalizedQuery =
        query.trim().toLowerCase();

      const rows = permits.map(
        (permit, index) => {
          const p =
            permit as PermitTableRow;

          const companySite =
            formatCompanySite(p);

          const applicant =
            formatApplicant(p);

          /*
          Applicant and Vessel/Project
          remain searchable.

          They are NOT displayed as columns.
          */

          const searchText = [
            // Visible fields
            p.serial_no,
            p.job_type,
            companySite,
            p.location_of_work,
            p.date_commencement,
            p.date_completion,
            p.state,
            p.state?.replaceAll(
              "_",
              " ",
            ),

            // Hidden searchable fields
            p.vessel_project,
            applicant,
            p.display_applicant_department,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return {
            permit: p,

            companySite,

            searchText,

            originalIndex: index,
          };
        },
      );

      /*
      ==========================================================
      SEARCH
      ==========================================================
      */

      const filtered =
        normalizedQuery
          ? rows.filter((row) =>
              row.searchText.includes(
                normalizedQuery,
              ),
            )
          : rows;

      /*
      ==========================================================
      NO SORT
      ==========================================================
      */

      if (!sort) {
        return filtered;
      }

      /*
      ==========================================================
      SORT
      ==========================================================
      */

      return [...filtered].sort(
        (a, b) => {
          const left = sortValue(
            a.permit,
            sort.key,
            a.companySite,
          );

          const right = sortValue(
            b.permit,
            sort.key,
            b.companySite,
          );

          const compared =
            left.localeCompare(
              right,
              undefined,
              {
                numeric: true,
                sensitivity: "base",
              },
            );

          if (compared === 0) {
            return (
              a.originalIndex -
              b.originalIndex
            );
          }

          return sort.direction ===
            "asc"
            ? compared
            : -compared;
        },
      );
    }, [
      permits,
      query,
      sort,
    ]);

  /*
  ============================================================
  SORT HANDLER
  ============================================================
  */

  function toggleSort(
    key: SortKey,
  ) {
    setSort((current) => {
      /*
      First click:
      ASC
      */

      if (
        !current ||
        current.key !== key
      ) {
        return {
          key,
          direction: "asc",
        };
      }

      /*
      Second click:
      DESC
      */

      if (
        current.direction ===
        "asc"
      ) {
        return {
          key,
          direction: "desc",
        };
      }

      /*
      Third click:
      RESET
      */

      return null;
    });
  }

  return (
    <div className="w-full">
      {/*
      ============================================================
      SEARCH
      ============================================================

      This search is ADDITIONAL to your existing filters.

      Existing filters are NOT removed.
      */}

      {searchable && (
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <label className="relative block max-w-xl">
            <span className="sr-only">
              Search permits
            </span>

            <Search
              className="
                pointer-events-none
                absolute
                left-3
                top-1/2
                h-4
                w-4
                -translate-y-1/2
                text-slate-400
              "
            />

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value,
                )
              }
              placeholder={
                searchPlaceholder
              }
              className="input w-full pl-9 pr-10"
            />

            {query && (
              <button
                type="button"
                onClick={() =>
                  setQuery("")
                }
                className="
                  absolute
                  right-2
                  top-1/2
                  inline-flex
                  h-7
                  w-7
                  -translate-y-1/2
                  items-center
                  justify-center
                  rounded
                  text-slate-500
                  hover:bg-slate-200
                  hover:text-slate-800
                "
                aria-label="Clear permit search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <p className="mt-1.5 text-xs text-slate-500">
            {visiblePermits.length} of{" "}
            {permits.length} permits shown.
          </p>
        </div>
      )}

      {/*
      ============================================================
      TABLE
      ============================================================

      ONLY THESE COLUMNS ARE DISPLAYED:

      Serial
      Job Type
      Company/Site
      Location
      Dates
      Status

      Applicant:
      - Searchable
      - Not displayed

      Vessel/Project:
      - Searchable
      - Not displayed
      */}

      <div className="w-full overflow-x-auto">
        {visiblePermits.length ===
        0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No permits match your search.
          </div>
        ) : (
          <table
            className="
              w-full
              table-auto
              text-sm
            "
          >
            {/*
            Auto layout: each column widens to fit
            its own content, nothing gets clipped.
            */}

            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <SortableHeader
                  label="Serial"
                  sortKey="serial_no"
                  sort={sort}
                  onSort={toggleSort}
                  className="w-px px-3"
                />

                <SortableHeader
                  label="Job Type"
                  sortKey="job_type"
                  sort={sort}
                  onSort={toggleSort}
                />

                <SortableHeader
                  label="Company/Site"
                  sortKey="company_site"
                  sort={sort}
                  onSort={toggleSort}
                />

                <SortableHeader
                  label="Location"
                  sortKey="location_of_work"
                  sort={sort}
                  onSort={toggleSort}
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
              </tr>
            </thead>

            <tbody>
              {visiblePermits.map(
                ({
                  permit: p,
                  companySite,
                }) => (
                  <tr
                    key={p.id}
                    className="
                      cursor-pointer
                      hover:bg-slate-50
                    "
                    onClick={() => {
                      window.location.href =
                        `/permits/${p.id}`;
                    }}
                  >
                    {/* SERIAL */}

                    <td className="w-px border-t border-slate-100 px-3 py-3 align-middle">
                      <span
                        className="block max-w-[120px] truncate text-xs text-slate-500"
                        title={p.serial_no}
                      >
                        {p.serial_no}
                      </span>
                    </td>

                    {/* JOB TYPE */}

                    <td className="border-t border-slate-100 px-4 py-3 align-middle">
                      <span className="text-sm text-slate-700">
                        {p.job_type ||
                          "—"}
                      </span>
                    </td>

                    {/* COMPANY / SITE */}

                    <td className="border-t border-slate-100 px-4 py-3 align-middle">
                      <span
                        className="whitespace-nowrap text-sm text-slate-700"
                        title={
                          companySite
                        }
                      >
                        {companySite ||
                          "—"}
                      </span>
                    </td>

                    {/* LOCATION */}

                    <td className="border-t border-slate-100 px-4 py-3 align-middle">
                      <span
                        className="whitespace-nowrap text-sm text-slate-700"
                        title={
                          p.location_of_work ||
                          ""
                        }
                      >
                        {p.location_of_work ||
                          "—"}
                      </span>
                    </td>

                    {/* DATES */}

                    <td className="border-t border-slate-100 px-4 py-3 align-middle">
                      <span className="whitespace-nowrap text-sm text-slate-700">
                        {formatDate(
                          p.date_commencement,
                        )}

                        {" → "}

                        {formatDate(
                          p.date_completion,
                        )}
                      </span>
                    </td>

                    {/* STATUS */}

                    <td className="border-t border-slate-100 px-4 py-3 align-middle">
                      <PermitStatusBadge
                        state={p.state}
                      />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/*
============================================================
SORTABLE TABLE HEADER
============================================================
*/

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;

  sortKey: SortKey;

  sort: SortState;

  onSort: (
    key: SortKey,
  ) => void;

  className?: string;
}) {
  const active =
    sort?.key === sortKey;

  return (
    <th
      scope="col"
      className={`px-4 py-3 text-left align-middle ${className}`}
    >
      <button
        type="button"
        onClick={() =>
          onSort(sortKey)
        }
        className="
          inline-flex
          items-center
          gap-1.5
          whitespace-nowrap
          text-xs
          font-medium
          text-slate-500
          hover:text-slate-950
        "
      >
        {label}

        {active ? (
          sort?.direction ===
          "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />
        )}
      </button>
    </th>
  );
}

/*
============================================================
COMPANY / SITE
============================================================
*/

function formatCompanySite(
  p: PermitTableRow,
) {
  if (
    p.company &&
    p.site
  ) {
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

/*
============================================================
APPLICANT

Used for SEARCH ONLY.
Not rendered in table.
============================================================
*/

function formatApplicant(
  p: PermitTableRow,
) {
  return (
    p.display_applicant_name ||
    p.applicant?.full_name ||
    "—"
  );
}

/*
============================================================
SORT VALUES
============================================================
*/

function sortValue(
  permit: PermitTableRow,
  key: SortKey,
  companySite: string,
) {
  switch (key) {
    case "serial_no":
      return (
        permit.serial_no || ""
      );

    case "job_type":
      return (
        permit.job_type || ""
      );

    case "company_site":
      return companySite;

    case "location_of_work":
      return (
        permit.location_of_work ||
        ""
      );

    case "date_commencement":
      return (
        permit.date_commencement ||
        ""
      );

    case "state":
      return (
        permit.state || ""
      );

    default:
      return "";
  }
}