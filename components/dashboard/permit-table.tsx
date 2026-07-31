"use client";

import * as React from "react";
import { Search, X, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

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

  /*
  ============================================================
  FILTER + SEARCH + SORT
  ============================================================

  Applicant and Vessel/Project:
  - NOT displayed in table
  - STILL searchable
  - NO sorting buttons
  */

  const visiblePermits = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const rows = permits.map((permit, index) => {
      const p = permit as PermitTableRow;

      const companySite = formatCompanySite(p);

      const applicant = formatApplicant(p);

      /*
      Applicant and Vessel/Project are intentionally included
      ONLY in searchText.

      They will NOT be rendered as table columns.
      */

      const searchText = [
        // Visible table fields
        p.serial_no,
        p.job_type,
        companySite,
        p.location_of_work,
        p.date_commencement,
        p.date_completion,
        p.state,
        p.state?.replaceAll("_", " "),

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
        originalIndex: index,
        companySite,
        searchText,
      };
    });

    /*
    ============================================================
    SEARCH
    ============================================================
    */

    const filteredRows = normalizedQuery
      ? rows.filter((row) =>
          row.searchText.includes(normalizedQuery),
        )
      : rows;

    /*
    ============================================================
    DEFAULT ORDER
    ============================================================
    */

    if (!sort) {
      return filteredRows;
    }

    /*
    ============================================================
    SORT
    ============================================================
    */

    return [...filteredRows].sort((a, b) => {
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

      const compared = left.localeCompare(
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

      return sort.direction === "asc"
        ? compared
        : -compared;
    });
  }, [permits, query, sort]);

  /*
  ============================================================
  SORT HANDLER
  ============================================================
  */

  function toggleSort(key: SortKey) {
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
        current.direction === "asc"
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
      SEARCH BAR
      ============================================================
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
                setQuery(event.target.value)
              }
              placeholder={searchPlaceholder}
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
            {permits.length} permit
            {permits.length === 1
              ? ""
              : "s"}{" "}
            shown.
          </p>
        </div>
      )}

      {/*
      ============================================================
      TABLE
      ============================================================

      EXACTLY 6 VISIBLE COLUMNS:

      1. Serial
      2. Job Type
      3. Company/Site
      4. Location
      5. Dates
      6. Status

      REMOVED:
      - Applicant
      - Vessel/Project
      - Open button column

      Applicant and Vessel/Project remain searchable
      through the search logic above.
      */}

      <div className="w-full overflow-x-auto border-t border-slate-200">
        {visiblePermits.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No permits match your search.
          </div>
        ) : (
          <table
            className="
              w-full
              min-w-[1050px]
              table-fixed
              border-collapse
              text-sm
            "
          >
            {/*
            ========================================================
            FIXED COLUMN WIDTHS

            These widths ensure the header and body
            remain aligned.
            ========================================================
            */}

            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>

            {/*
            ========================================================
            TABLE HEADER
            ========================================================
            */}

            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <TableHeader
                  label="Serial"
                  sortKey="serial_no"
                  sort={sort}
                  onSort={toggleSort}
                />

                <TableHeader
                  label="Job Type"
                  sortKey="job_type"
                  sort={sort}
                  onSort={toggleSort}
                />

                <TableHeader
                  label="Company/Site"
                  sortKey="company_site"
                  sort={sort}
                  onSort={toggleSort}
                />

                <TableHeader
                  label="Location"
                  sortKey="location_of_work"
                  sort={sort}
                  onSort={toggleSort}
                />

                <TableHeader
                  label="Dates"
                  sortKey="date_commencement"
                  sort={sort}
                  onSort={toggleSort}
                />

                <TableHeader
                  label="Status"
                  sortKey="state"
                  sort={sort}
                  onSort={toggleSort}
                />
              </tr>
            </thead>

            {/*
            ========================================================
            TABLE BODY
            ========================================================
            */}

            <tbody className="divide-y divide-slate-200">
              {visiblePermits.map(
                ({
                  permit: p,
                  companySite,
                }) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      window.location.href =
                        `/permits/${p.id}`;
                    }}
                    className="
                      cursor-pointer
                      transition-colors
                      hover:bg-slate-50
                    "
                  >
                    {/*
                    ==================================================
                    1. SERIAL
                    ==================================================
                    */}

                    <td className="px-4 py-3 align-middle">
                      <span
                        className="
                          whitespace-nowrap
                          font-mono
                          text-xs
                          text-slate-500
                        "
                      >
                        {p.serial_no}
                      </span>
                    </td>

                    {/*
                    ==================================================
                    2. JOB TYPE
                    ==================================================
                    */}

                    <td className="px-4 py-3 align-middle">
                      <span className="font-medium text-slate-900">
                        {p.job_type || "—"}
                      </span>
                    </td>

                    {/*
                    ==================================================
                    3. COMPANY / SITE
                    ==================================================
                    */}

                    <td className="px-4 py-3 align-middle">
                      <span
                        className="
                          block
                          truncate
                          text-slate-600
                        "
                        title={
                          companySite ||
                          undefined
                        }
                      >
                        {companySite || "—"}
                      </span>
                    </td>

                    {/*
                    ==================================================
                    4. LOCATION
                    ==================================================
                    */}

                    <td className="px-4 py-3 align-middle">
                      <span
                        className="
                          block
                          truncate
                          text-slate-600
                        "
                        title={
                          p.location_of_work ||
                          undefined
                        }
                      >
                        {p.location_of_work ||
                          "—"}
                      </span>
                    </td>

                    {/*
                    ==================================================
                    5. DATES
                    ==================================================
                    */}

                    <td className="px-4 py-3 align-middle">
                      <span
                        className="
                          whitespace-nowrap
                          text-xs
                          text-slate-500
                        "
                      >
                        {formatDate(
                          p.date_commencement,
                        )}

                        {" → "}

                        {formatDate(
                          p.date_completion,
                        )}
                      </span>
                    </td>

                    {/*
                    ==================================================
                    6. STATUS
                    ==================================================
                    */}

                    <td className="px-4 py-3 align-middle">
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
TABLE HEADER COMPONENT
============================================================

Sorting is ONLY available for the 6 visible columns.

There is:
- NO Applicant sort
- NO Vessel/Project sort
============================================================
*/

function TableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (
    key: SortKey,
  ) => void;
}) {
  const active =
    sort?.key === sortKey;

  return (
    <th
      scope="col"
      className="
        px-4
        py-3
        text-left
        align-middle
        font-normal
      "
    >
      <button
        type="button"
        onClick={() =>
          onSort(sortKey)
        }
        className={`
          inline-flex
          items-center
          gap-1.5
          whitespace-nowrap
          rounded
          text-xs
          font-medium
          transition-colors
          ${
            active
              ? "text-slate-950"
              : "text-slate-500 hover:text-slate-950"
          }
        `}
        title={`Sort by ${label}`}
      >
        <span>
          {label}
        </span>

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
COMPANY / SITE FORMATTER
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
APPLICANT FORMATTER

Used ONLY for searching.
Never rendered in the table.
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
SORT VALUE

Only visible columns can be sorted.
============================================================
*/

function sortValue(
  permit: PermitTableRow,
  key: SortKey,
  companySite: string,
) {
  switch (key) {
    case "serial_no":
      return permit.serial_no || "";

    case "job_type":
      return permit.job_type || "";

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
      return permit.state || "";

    default:
      return "";
  }
}