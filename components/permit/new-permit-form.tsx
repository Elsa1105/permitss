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
import { todayISO } from "@/lib/utils";

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

export function NewPermitForm({ currentUser, companies, sites }: Props) {
  const router = useRouter();

  const isGuestApplicant =
    currentUser.role === "guest_applicant" ||
    currentUser.role === "contractor";

  const firstCompanyId = companies[0]?.id ?? "";
  const firstSiteId =
    sites.find((site) => site.company_id === firstCompanyId)?.id ??
    sites[0]?.id ??
    "";

  const [form, setForm] = React.useState<NewPermitInput>({
    company_id: firstCompanyId,
    site_id: firstSiteId,

    vessel_project: "",
    location_of_work: "",
    description: "",
    date_commencement: todayISO(),
    date_completion: todayISO(),
    hazard_types: [],
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

  function set<K extends keyof NewPermitInput>(
    key: K,
    value: NewPermitInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleHazard(value: string) {
    setForm((current) => ({
      ...current,
      hazard_types: current.hazard_types.includes(value)
        ? current.hazard_types.filter((h) => h !== value)
        : [...current.hazard_types, value],
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = NewPermitSchema.safeParse(form);

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};

      for (const issue of parsed.error.issues) {
        nextErrors[issue.path.join(".")] = issue.message;
      }

      setErrors(nextErrors);
      toast.error("Please fix the highlighted fields");
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const res = await fetch("/api/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
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

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Permit details</CardTitle>
        </CardHeader>

        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Applicant" defaultValue={currentUser.full_name} disabled />

            <Input
              label="Department"
              defaultValue={currentUser.department ?? "—"}
              disabled
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
                  Contractor information is required for guest permit requests.
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
                  I acknowledge that workers have been briefed on the work scope,
                  hazards, controls, emergency response, and permit conditions.
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
              required
              name="contractor"
              value={form.contractor}
              onChange={(e) => set("contractor", e.target.value)}
              error={errors.contractor}
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
              min={todayISO()}
              name="date_commencement"
              value={form.date_commencement}
              onChange={(e) => set("date_commencement", e.target.value)}
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
              hint="Defines validity. Permits >1 day require daily SRM endorsement."
              error={errors.date_completion}
            />
          </div>

          <div className="field">
            <span className="field-label field-required">Type of Hazard</span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {HAZARD_TYPES.map((hazard) => {
                const active = form.hazard_types.includes(hazard.value);

                return (
                  <button
                    type="button"
                    key={hazard.value}
                    onClick={() => toggleHazard(hazard.value)}
                    className={
                      "px-3 py-2.5 rounded-md border text-sm font-medium transition-colors touch-target " +
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