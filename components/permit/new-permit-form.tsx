"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HAZARD_TYPES } from "@/lib/permits/hazards";
import { NewPermitSchema, type NewPermitInput } from "@/lib/permits/schemas";
import type { CompanyRow, SiteRow } from "@/lib/supabase/types";

interface Props {
  currentUser: {
    id: string;
    full_name: string;
    department: string | null;
    role?: string;
  };
  companies: CompanyRow[];
  sites: SiteRow[];
}

type ExtendedNewPermitInput = NewPermitInput & {
  display_applicant_name: string;
  display_applicant_department: string;
  other_hazard_text: string;
};

function todayInSingapore() {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function daysBetweenInclusive(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  const diff = Math.floor(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diff + 1;
}

export function NewPermitForm({ currentUser, companies, sites }: Props) {
  const router = useRouter();
  const today = React.useMemo(() => todayInSingapore(), []);

  const isGuestApplicant =
    currentUser.role === "guest_applicant" ||
    currentUser.role === "contractor";

  const firstCompanyId = companies[0]?.id ?? "";
  const firstSiteId =
    sites.find((site) => site.company_id === firstCompanyId)?.id ??
    sites[0]?.id ??
    "";

  const [form, setForm] = React.useState<ExtendedNewPermitInput>({
    company_id: firstCompanyId,
    site_id: firstSiteId,

    display_applicant_name:
      currentUser.full_name?.trim() || currentUser.id || "",
    display_applicant_department: currentUser.department ?? "",

    vessel_project: "",
    location_of_work: "",
    description: "",
    date_commencement: today,
    date_completion: today,
    hazard_types: [],
    other_hazard_text: "",
    contractor: "",

    contractor_company: "",
    contractor_supervisor_name: "",
    contractor_supervisor_registration_no: "",
    worker_briefing_acknowledged: false,
    top_controls_summary: "",
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const filteredSites = sites.filter(
    (site) => site.company_id === form.company_id,
  );

  const selectedOtherHazard = form.hazard_types.includes("other");
  const permitDays = daysBetweenInclusive(
    form.date_commencement,
    form.date_completion,
  );

  function set<K extends keyof ExtendedNewPermitInput>(
    key: K,
    value: ExtendedNewPermitInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleHazard(value: string) {
    setForm((current) => {
      const nextHazards = current.hazard_types.includes(value)
        ? current.hazard_types.filter((h) => h !== value)
        : [...current.hazard_types, value];

      return {
        ...current,
        hazard_types: nextHazards,
        other_hazard_text: nextHazards.includes("other")
          ? current.other_hazard_text
          : "",
      };
    });
  }

  function validateExtraFields() {
    const nextErrors: Record<string, string> = {};

    if (!form.display_applicant_name.trim()) {
      nextErrors.display_applicant_name = "Applicant name is required";
    }

    if (selectedOtherHazard && !form.other_hazard_text.trim()) {
      nextErrors.other_hazard_text = "Please specify the other hazard";
    }

    if (permitDays > 14) {
      nextErrors.date_completion =
        "Hot Work Permit validity cannot exceed 14 days for Day 2–14 endorsement flow";
    }

    return nextErrors;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const extraErrors = validateExtraFields();

    const parsed = NewPermitSchema.safeParse({
      ...form,
      display_applicant_name: form.display_applicant_name.trim(),
      display_applicant_department:
        form.display_applicant_department?.trim() ?? "",
      other_hazard_text: selectedOtherHazard
        ? form.other_hazard_text.trim()
        : "",
      contractor: form.contractor?.trim() ?? "",
      contractor_company: form.contractor_company?.trim() ?? "",
      contractor_supervisor_name:
        form.contractor_supervisor_name?.trim() ?? "",
      contractor_supervisor_registration_no:
        form.contractor_supervisor_registration_no?.trim() ?? "",
      top_controls_summary: form.top_controls_summary?.trim() ?? "",
    });

    if (!parsed.success || Object.keys(extraErrors).length > 0) {
      const nextErrors: Record<string, string> = { ...extraErrors };

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          nextErrors[issue.path.join(".")] = issue.message;
        }
      }

      setErrors(nextErrors);

      const firstError =
        Object.values(nextErrors)[0] ?? "Please fix the highlighted fields";

      toast.error(firstError);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const payload = {
        ...parsed.data,
        display_applicant_name: parsed.data.display_applicant_name.trim(),
        display_applicant_department:
          parsed.data.display_applicant_department.trim(),
        other_hazard_text: selectedOtherHazard
          ? parsed.data.other_hazard_text.trim()
          : "",
      };

      const res = await fetch("/api/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Failed to create permit");
        return;
      }

      toast.success(`Permit ${body.serial_no} created`);
      router.push(`/permits/${body.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (companies.length === 0 || sites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Permit details</CardTitle>
        </CardHeader>

        <CardBody>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Company/site setup is incomplete. Please ask an admin to create
            active company and site records first.
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Permit details</CardTitle>
        </CardHeader>

        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Applicant"
              required
              value={form.display_applicant_name}
              onChange={(e) => set("display_applicant_name", e.target.value)}
              error={errors.display_applicant_name}
              hint="Editable because one department may have more than one applicant."
            />

            <Input
              label="Department"
              value={form.display_applicant_department}
              onChange={(e) =>
                set("display_applicant_department", e.target.value)
              }
              error={errors.display_applicant_department}
              hint="Auto-filled from user profile if available."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="field">
              <span className="field-label field-required">Company</span>

              <select
                className="input"
                value={form.company_id}
                onChange={(e) => {
                  const companyId = e.target.value;
                  const firstSite = sites.find(
                    (site) => site.company_id === companyId,
                  );

                  setForm((current) => ({
                    ...current,
                    company_id: companyId,
                    site_id: firstSite?.id ?? "",
                  }));
                }}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code} - {company.name}
                  </option>
                ))}
              </select>

              {errors.company_id ? (
                <p className="text-xs text-red-600">{errors.company_id}</p>
              ) : null}
            </label>

            <label className="field">
              <span className="field-label field-required">Site</span>

              <select
                className="input"
                value={form.site_id}
                onChange={(e) => set("site_id", e.target.value)}
              >
                {filteredSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>

              {errors.site_id ? (
                <p className="text-xs text-red-600">{errors.site_id}</p>
              ) : null}
            </label>
          </div>

          {isGuestApplicant ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  Guest Applicant / Contractor Details
                </h3>
                <p className="text-xs text-amber-800 mt-1">
                  Contractor information and worker briefing confirmation are
                  required for guest permit requests.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Contractor Company"
                  required
                  value={form.contractor_company}
                  onChange={(e) => set("contractor_company", e.target.value)}
                  error={errors.contractor_company}
                />

                <Input
                  label="Contractor Supervisor Name"
                  required
                  value={form.contractor_supervisor_name}
                  onChange={(e) =>
                    set("contractor_supervisor_name", e.target.value)
                  }
                  error={errors.contractor_supervisor_name}
                />
              </div>

              <Input
                label="Supervisor Registration No."
                required
                value={form.contractor_supervisor_registration_no}
                onChange={(e) =>
                  set("contractor_supervisor_registration_no", e.target.value)
                }
                error={errors.contractor_supervisor_registration_no}
              />

              <Textarea
                label="Top Controls Summary"
                required
                placeholder="Summarise the key risk controls, RA/JSA controls, barricade, fire watch, gas test, PPE, and emergency controls."
                value={form.top_controls_summary}
                onChange={(e) => set("top_controls_summary", e.target.value)}
                error={errors.top_controls_summary}
              />

              <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={form.worker_briefing_acknowledged}
                  onChange={(e) =>
                    set("worker_briefing_acknowledged", e.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />

                <span>
                  I acknowledge that workers have been briefed on the work
                  scope, hazards, controls, emergency response, and permit
                  conditions.
                </span>
              </label>

              {errors.worker_briefing_acknowledged ? (
                <p className="text-xs text-red-600">
                  {errors.worker_briefing_acknowledged}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Vessel / Project"
              required
              name="vessel_project"
              value={form.vessel_project}
              onChange={(e) => set("vessel_project", e.target.value)}
              error={errors.vessel_project}
            />

            <Input
              label="Contractor"
              required={isGuestApplicant}
              name="contractor"
              value={form.contractor}
              onChange={(e) => set("contractor", e.target.value)}
              error={errors.contractor}
              hint={
                isGuestApplicant
                  ? undefined
                  : "Required only when contractor is involved."
              }
            />
          </div>

          <Input
            label="Location of Work"
            required
            name="location_of_work"
            value={form.location_of_work}
            onChange={(e) => set("location_of_work", e.target.value)}
            error={errors.location_of_work}
          />

          <Textarea
            label="Description of Work"
            required
            name="description"
            placeholder="Describe what hot work will be performed (min 10 chars)"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            error={errors.description}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date of Commencement"
              required
              type="date"
              min={today}
              name="date_commencement"
              value={form.date_commencement}
              onChange={(e) => {
                const nextStart = e.target.value;

                setForm((current) => ({
                  ...current,
                  date_commencement: nextStart,
                  date_completion:
                    current.date_completion < nextStart
                      ? nextStart
                      : current.date_completion,
                }));
              }}
              error={errors.date_commencement}
            />

            <Input
              label="Date of Completion"
              required
              type="date"
              min={form.date_commencement}
              name="date_completion"
              value={form.date_completion}
              onChange={(e) => set("date_completion", e.target.value)}
              hint="Maximum 14 days for Day 2–14 endorsement flow."
              error={errors.date_completion}
            />
          </div>

          {permitDays > 1 ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              This is a multi-day permit. SRM endorsement is required from Day 2
              to Day {Math.min(permitDays, 14)}.
            </div>
          ) : null}

          <div className="field">
            <span className="field-label field-required">Type of Hazard</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {HAZARD_TYPES.map((hazard) => {
                const active = form.hazard_types.includes(hazard.value);

                return (
                  <button
                    type="button"
                    key={hazard.value}
                    onClick={() => toggleHazard(hazard.value)}
                    className={
                      "px-3 py-2.5 rounded-md border text-sm font-medium transition-colors touch-target text-left " +
                      (active
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
                    }
                    aria-pressed={active}
                  >
                    {hazard.label}
                  </button>
                );
              })}
            </div>

            {errors.hazard_types ? (
              <p className="text-xs text-red-600">{errors.hazard_types}</p>
            ) : null}
          </div>

          {selectedOtherHazard ? (
            <Textarea
              label="Other Hazard Details"
              required
              placeholder="Specify the other hot work hazard."
              value={form.other_hazard_text}
              onChange={(e) => set("other_hazard_text", e.target.value)}
              error={errors.other_hazard_text}
            />
          ) : null}
        </CardBody>

        <CardFooter>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>

          <Button type="submit" loading={submitting}>
            Save & continue to Stage I
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}