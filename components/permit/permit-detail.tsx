"use client";

import * as React from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { canPerform } from "@/lib/permits/state-machine";
import {
  currentPermitDay,
  isMultiDay,
  permitDayRange,
} from "@/lib/permits/day";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Stage1Form } from "./stage-1-form";
import { Stage2Form } from "./stage-2-form";
import { Stage3Form } from "./stage-3-form";
import { Stage4Form } from "./stage-4-form";
import { EndorsementForm } from "./endorsement-form";
import { PhotoUploader } from "./photo-uploader";
import { DocumentUploader } from "./document-uploader";
import type {
  PermitDocumentRow,
  PermitEndorsementRow,
  PermitPhotoRow,
  PermitStageRow,
  PermitWithJoins,
  UserRow,
} from "@/lib/supabase/types";

type PermitDetailExtra = PermitWithJoins & {
  display_applicant_name?: string | null;
  display_applicant_department?: string | null;
  job_type?: string | null;
  other_hazard_text?: string | null;
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

interface Props {
  currentUser: UserRow;
  permit: PermitWithJoins;
  stages: PermitStageRow[];
  endorsements: PermitEndorsementRow[];
  photos: (PermitPhotoRow & { signedUrl: string })[];
  documents?: (PermitDocumentRow & { signedUrl?: string })[];
  bucket: string;
  documentBucket?: string;
}

const STAGE2_ITEMS = [
  ["isolation_checked", "Isolation checked"],
  ["barricade_installed", "Barricade installed"],
  ["gas_test_completed", "Gas test completed"],
  ["fire_watch_assigned", "Fire watch assigned"],
  ["ppe_verified", "PPE verified"],
  ["evidence_reviewed", "Evidence reviewed"],
] as const;

export function PermitDetail({
  currentUser,
  permit,
  stages,
  endorsements,
  photos,
  documents = [],
  bucket,
  documentBucket = "permit-documents",
}: Props) {
  const p = permit as PermitDetailExtra;

  const stage1 = stages.find((s) => s.stage === "I");
  const stage2 = stages.find((s) => s.stage === "II");
  const stage3 = stages.find((s) => s.stage === "III");
  const stage4 = stages.find((s) => s.stage === "IV");

  const role = String(currentUser.role);

  const isApplicant = currentUser.id === permit.applicant_id;

  const isRealAssessor =
    role === "safety_assessor" || role === "assessor";

  const isAssessor = isRealAssessor || role === "admin";

  const isSrm = role === "srm" || role === "admin";

  const isSrmOverride = (role === "srm" || role === "admin") && !isApplicant;

  const hasStage1 = Boolean(stage1);
  const hasStage2 = Boolean(stage2);
  const hasStage3 = Boolean(stage3);
  const hasStage4 = Boolean(stage4);

  const showStage1Form =
    !hasStage1 &&
    (isApplicant || isSrmOverride) &&
    canPerform(permit.state, "submit_stage1");

  const showStage1Override = !isApplicant && isSrmOverride && showStage1Form;

  const showStage2Form =
    hasStage1 &&
    !hasStage2 &&
    (isAssessor || role === "srm" || role === "admin") &&
    canPerform(permit.state, "submit_stage2");

  const showStage2Override =
    showStage2Form && !isRealAssessor && role !== "admin";

  const showStage3Form =
    hasStage2 &&
    !hasStage3 &&
    isSrm &&
    canPerform(permit.state, "submit_stage3") &&
    permit.applicant_id !== currentUser.id;

  const showStage4Form =
    hasStage3 &&
    !hasStage4 &&
    (isApplicant || role === "srm" || role === "admin") &&
    canPerform(permit.state, "submit_stage4");

  const showStage4Override =
    showStage4Form && !isApplicant && role !== "admin";

  const showEndorsementForm =
    hasStage3 &&
    isSrm &&
    canPerform(permit.state, "endorse_day") &&
    isMultiDay(permit);

  const editableBeforeAssessment =
    (isApplicant || role === "srm" || role === "admin") &&
    (permit.state === "draft" || permit.state === "pending_safety_assessment");

  const currentDay = currentPermitDay(permit);
  const maxEndorsementDay = Math.min(permitDayRange(permit), 14);

  const endorsedDays = new Set(endorsements.map((e) => e.day_number));

  // Any Day 2..min(today, maxEndorsementDay) that hasn't been endorsed yet is
  // eligible — this is what lets a missed day (public holiday / leave /
  // oversight) be endorsed retrospectively instead of locking the permit.
  const pendingDays = Array.from(
    { length: Math.max(0, Math.min(currentDay, maxEndorsementDay) - 1) },
    (_, i) => i + 2,
  ).filter((d) => !endorsedDays.has(d));

  const applicantName =
    p.display_applicant_name || permit.applicant?.full_name || "—";

  const applicantDepartment =
    p.display_applicant_department || permit.applicant?.department || "—";

  const hazardText = formatHazards(
    permit.hazard_types,
    p.other_hazard_text ?? null,
  );

  // Day picker state: which day the SRM is about to endorse. Defaults to
  // today's day (or the earliest missed day) and stays in sync whenever the
  // set of pending days changes (e.g. right after a submission clears one).
  const [selectedDay, setSelectedDay] = React.useState<number>(
    pendingDays[0] ?? currentDay,
  );

  React.useEffect(() => {
    if (pendingDays.length > 0 && !pendingDays.includes(selectedDay)) {
      setSelectedDay(pendingDays[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDays.join(",")]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
        </CardHeader>

        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Applicant" value={applicantName} />
          <Field label="Department" value={applicantDepartment} />

          {p.company ? (
            <Field
              label="Company"
              value={`${p.company.code} - ${p.company.name}`}
            />
          ) : null}

          {p.site ? (
            <Field label="Site" value={`${p.site.code} - ${p.site.name}`} />
          ) : null}

          <Field label="Job Type" value={p.job_type} />
          <Field label="Vessel / Project" value={permit.vessel_project} />
          <Field label="Location of Work" value={permit.location_of_work} />
          <Field label="Hazard Types" value={hazardText} />

          <Field
            label="Date of Commencement"
            value={formatDate(permit.date_commencement)}
          />

          <Field
            label="Date of Completion"
            value={formatDate(permit.date_completion)}
          />

          <Field label="Contractor" value={permit.contractor} />

          {permit.contractor_company ? (
            <Field
              label="Contractor Company"
              value={permit.contractor_company}
            />
          ) : null}

          {permit.contractor_supervisor_name ? (
            <Field
              label="Contractor Supervisor"
              value={permit.contractor_supervisor_name}
            />
          ) : null}

          {permit.contractor_supervisor_registration_no ? (
            <Field
              label="Supervisor Registration No."
              value={permit.contractor_supervisor_registration_no}
            />
          ) : null}

          <div className="sm:col-span-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Description
            </div>
            <div className="mt-0.5 whitespace-pre-wrap">
              {permit.description}
            </div>
          </div>

          {permit.top_controls_summary ? (
            <div className="sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Top Controls Summary
              </div>
              <div className="mt-0.5 whitespace-pre-wrap">
                {permit.top_controls_summary}
              </div>
            </div>
          ) : null}

          {permit.worker_briefing_acknowledged ? (
            <div className="sm:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Worker briefing acknowledged by contractor / guest applicant.
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos & Sketch</CardTitle>
        </CardHeader>

        <CardBody>
          <PhotoUploader
            permitId={permit.id}
            bucket={bucket}
            initialPhotos={photos}
            disabled={!editableBeforeAssessment}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supporting Documents / RA</CardTitle>
        </CardHeader>

        <CardBody>
          <DocumentUploader
            permitId={permit.id}
            bucket={documentBucket}
            initialDocuments={documents}
            disabled={!editableBeforeAssessment}
          />
        </CardBody>
      </Card>

      <StageCard
        title="Stage I — Raising of Permit"
        meta={
          stage1
            ? {
                by: applicantName,
                role: applicantDepartment,
                ts: stage1.submitted_at,
              }
            : null
        }
      >
        {stage1 ? (
          <ChecklistDisplay data={stage1.data as Record<string, boolean>} />
        ) : showStage1Form ? (
          <>
            {showStage1Override ? (
              <OverrideNotice role={role} stage="I" />
            ) : null}

            <Stage1Form
              permitId={permit.id}
              currentUser={{
                full_name: currentUser.full_name,
                department: currentUser.department,
              }}
            />
          </>
        ) : (
          <PendingNotice msg="Stage I not yet submitted." />
        )}
      </StageCard>

      <StageCard
        title="Stage II — Endorsement by Safety Assessor"
        meta={
          stage2
            ? {
                by: permit.assessor?.full_name ?? "—",
                role:
                  (stage2.data as { position?: string }).position ??
                  "Safety Assessor",
                ts: stage2.submitted_at,
              }
            : null
        }
      >
        {stage2 ? (
          <Stage2Display
            data={
              stage2.data as {
                fit: boolean;
                remarks?: string;
                checklist?: Record<string, boolean | string>;
                checklist_status?: Record<string, string>;
              }
            }
          />
        ) : showStage2Form ? (
          <>
            {showStage2Override ? (
              <OverrideNotice role={role} stage="II" />
            ) : null}

            <Stage2Form permitId={permit.id} />
          </>
        ) : (
          <PendingNotice
            msg={
              !hasStage1
                ? "Awaiting Stage I submission."
                : "Pending Safety Assessor condition verification."
            }
          />
        )}
      </StageCard>

      <StageCard
        title="Stage III — Approved by Ship Repair-Manager / Project Manager"
        meta={
          stage3
            ? {
                by: permit.srm?.full_name ?? "—",
                role: permit.srm?.department ?? "SRM / Project Manager",
                ts: stage3.submitted_at,
              }
            : null
        }
      >
        {stage3 ? (
          <Stage3Display
            data={stage3.data as { decision: string; reason?: string }}
          />
        ) : showStage3Form ? (
          <Stage3Form permitId={permit.id} />
        ) : (
          <PendingNotice
            msg={
              permit.applicant_id === currentUser.id && isSrm
                ? "Separation of duties: SRMs cannot approve permits they raised."
                : !hasStage2
                  ? "Pending Safety Assessor endorsement."
                  : "Pending SRM / Project Manager evaluation."
            }
          />
        )}
      </StageCard>

      {isMultiDay(permit) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Day 2–{maxEndorsementDay} Endorsements</CardTitle>
              <Badge tone="info">Today is Day {currentDay}</Badge>
            </div>
          </CardHeader>

          <CardBody className="space-y-3">
            <EndorsementGrid
              endorsements={endorsements}
              dayRange={maxEndorsementDay}
              pendingDays={pendingDays}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />

            {showEndorsementForm ? (
              <EndorsementForm
                permitId={permit.id}
                maxDay={maxEndorsementDay}
                existingDays={endorsements.map((e) => e.day_number)}
                pendingDays={pendingDays}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <StageCard
        title="Stage IV — Notification of Completion"
        meta={
          stage4
            ? {
                by: permit.closer?.full_name ?? "—",
                role: permit.closer?.department ?? "Applicant",
                ts: stage4.submitted_at,
              }
            : null
        }
      >
        {stage4 ? (
          <p className="text-sm text-slate-700">Permit closed and archived.</p>
        ) : showStage4Form ? (
          <>
            {showStage4Override ? (
              <OverrideNotice role={role} stage="IV" />
            ) : null}

            <Stage4Form permitId={permit.id} />
          </>
        ) : (
          <PendingNotice
            msg={
              !hasStage3
                ? "Close-out becomes available once SRM approval is completed."
                : "Close-out becomes available once the permit is approved/active."
            }
          />
        )}
      </StageCard>
    </div>
  );
}

function formatHazards(hazards: string[], otherText?: string | null) {
  return hazards
    .map((hazard) => {
      if (hazard === "other" && otherText) {
        return `Other: ${otherText}`;
      }

      return hazard
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    })
    .join(", ");
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 font-medium text-slate-900">{value || "—"}</div>
    </div>
  );
}

function StageCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta: { by: string; role: string; ts: string } | null;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>{title}</CardTitle>

          {meta ? (
            <div className="text-xs text-slate-500 text-right">
              <div>
                Signed by{" "}
                <span className="font-medium text-slate-700">{meta.by}</span>{" "}
                ({meta.role})
              </div>
              <div>{formatDateTime(meta.ts)}</div>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardBody>{children}</CardBody>
    </Card>
  );
}

function ChecklistDisplay({ data }: { data: Record<string, boolean> }) {
  const items = [
    ["check_ventilation", "Maintain adequate ventilation & lighting."],
    ["check_display", "Prominent display of hot work permit with sketch."],
    ["check_watchman", "Provide watchman with fire extinguisher or hose."],
  ] as const;

  return (
    <ul className="space-y-1.5 text-sm">
      {items.map(([key, label]) => (
        <li key={key} className="flex items-start gap-2">
          <span
            className={
              data[key]
                ? "h-5 w-5 rounded bg-emerald-600 text-white grid place-items-center text-xs"
                : "h-5 w-5 rounded border border-slate-300 grid place-items-center"
            }
          >
            {data[key] ? "✓" : ""}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

function Stage2Display({
  data,
}: {
  data: {
    fit: boolean;
    remarks?: string;
    checklist?: Record<string, boolean | string>;
    checklist_status?: Record<string, string>;
  };
}) {
  function getStatus(key: string) {
    const explicit = data.checklist_status?.[key];

    if (explicit === "yes" || explicit === "no" || explicit === "na") {
      return explicit;
    }

    const value = data.checklist?.[key];

    if (value === "yes" || value === "no" || value === "na") {
      return value;
    }

    if (value === true) return "yes";
    if (value === false) return "no";

    return "unset";
  }

  return (
    <div className="space-y-3">
      <Badge tone={data.fit ? "ok" : "bad"}>
        {data.fit ? "Fit for Hot Work" : "Not Fit for Hot Work"}
      </Badge>

      {data.checklist || data.checklist_status ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Condition Verification Checklist
          </div>

          <ul className="space-y-1.5 text-sm">
            {STAGE2_ITEMS.map(([key, label]) => {
              const status = getStatus(key);

              return (
                <li key={key} className="flex items-start gap-2">
                  <StatusPill status={status} />
                  <span>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {data.remarks ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">
          <span className="text-xs uppercase tracking-wide text-slate-500 block">
            Remarks
          </span>
          {data.remarks}
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "yes") {
    return (
      <span className="h-5 min-w-5 rounded bg-emerald-600 px-1.5 text-white grid place-items-center text-[10px]">
        YES
      </span>
    );
  }

  if (status === "na") {
    return (
      <span className="h-5 min-w-5 rounded bg-blue-600 px-1.5 text-white grid place-items-center text-[10px]">
        N/A
      </span>
    );
  }

  if (status === "no") {
    return (
      <span className="h-5 min-w-5 rounded bg-red-600 px-1.5 text-white grid place-items-center text-[10px]">
        NO
      </span>
    );
  }

  return (
    <span className="h-5 min-w-5 rounded border border-slate-300 px-1.5 grid place-items-center text-[10px] text-slate-400">
      —
    </span>
  );
}

function Stage3Display({
  data,
}: {
  data: { decision: string; reason?: string };
}) {
  return (
    <div className="space-y-2">
      <Badge tone={data.decision === "approve" ? "ok" : "bad"}>
        {data.decision === "approve" ? "Approved" : "Rejected"}
      </Badge>

      {data.reason ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">
          <span className="text-xs uppercase tracking-wide text-slate-500 block">
            Reason
          </span>
          {data.reason}
        </p>
      ) : null}
    </div>
  );
}

function PendingNotice({ msg }: { msg: string }) {
  return <p className="text-sm text-slate-500 italic">{msg}</p>;
}

function OverrideNotice({ role, stage }: { role: string; stage: string }) {
  const label =
    role === "srm"
      ? "Acting as Ship Repair-Manager / Project Manager (override)"
      : "Acting as Admin (override)";

  return (
    <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>{label}</strong>
      <p className="mt-1 text-amber-800">
        You're submitting Stage {stage} on behalf of someone else. The audit log
        will record both your identity and the override.
      </p>
    </div>
  );
}

function EndorsementGrid({
  endorsements,
  dayRange,
  pendingDays,
  selectedDay,
  onSelectDay,
}: {
  endorsements: PermitEndorsementRow[];
  dayRange: number;
  pendingDays?: number[];
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
}) {
  const days = Array.from(
    { length: Math.min(13, dayRange - 1) },
    (_, i) => i + 2,
  );

  const map = new Map(endorsements.map((e) => [e.day_number, e]));
  const pendingSet = new Set(pendingDays ?? []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {days.map((day) => {
        const endorsement = map.get(day);
        const isPending = pendingSet.has(day);
        const isSelected = isPending && selectedDay === day;

        const toneClasses = endorsement
          ? endorsement.action === "continue"
            ? "bg-emerald-50 border-emerald-200"
            : "bg-red-50 border-red-200"
          : isSelected
            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
            : isPending
              ? "bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-400 hover:bg-amber-100"
              : "bg-slate-50 border-slate-200 text-slate-400";

        const inner = (
          <>
            <div
              className={
                "font-semibold " +
                (isSelected ? "text-white" : "text-slate-700")
              }
            >
              Day {day}
            </div>

            {endorsement ? (
              <>
                <div className="capitalize mt-1">{endorsement.action}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {formatDate(endorsement.ts)}
                </div>
              </>
            ) : isPending ? (
              <div className="mt-1">
                {isSelected ? "Selected" : "Click to endorse"}
              </div>
            ) : (
              <div className="mt-1">Pending</div>
            )}
          </>
        );

        // Pending days become clickable buttons — this is the day picker.
        // Already-endorsed and not-yet-available days stay as static cards.
        if (isPending && onSelectDay) {
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={
                "w-full rounded-md border p-3 text-center text-xs transition cursor-pointer " +
                toneClasses
              }
            >
              {inner}
            </button>
          );
        }

        return (
          <div
            key={day}
            className={"rounded-md border p-3 text-center text-xs " + toneClasses}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
