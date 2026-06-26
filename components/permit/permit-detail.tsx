"use client";

import * as React from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canPerform } from "@/lib/permits/state-machine";
import { currentPermitDay, isMultiDay, permitDayRange } from "@/lib/permits/day";
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
  const stage1 = stages.find((s) => s.stage === "I");
  const stage2 = stages.find((s) => s.stage === "II");
  const stage3 = stages.find((s) => s.stage === "III");
  const stage4 = stages.find((s) => s.stage === "IV");

  const isApplicant = currentUser.id === permit.applicant_id;
  const isAssessor = currentUser.role === "assessor" || currentUser.role === "admin";
  const isSrm = currentUser.role === "srm" || currentUser.role === "admin";

  const isSrmOverride =
    (currentUser.role === "srm" || currentUser.role === "admin") && !isApplicant;

  const showStage1Form =
    (isApplicant || isSrmOverride) && canPerform(permit.state, "submit_stage1");
  const showStage1Override = !isApplicant && isSrmOverride && showStage1Form;

  const showStage2Form =
    (isAssessor || currentUser.role === "srm" || currentUser.role === "admin") &&
    canPerform(permit.state, "submit_stage2");
  const showStage2Override =
    showStage2Form && currentUser.role !== "assessor" && currentUser.role !== "admin";

  const showStage3Form =
    isSrm &&
    canPerform(permit.state, "submit_stage3") &&
    permit.applicant_id !== currentUser.id;

  const showStage4Form =
    (isApplicant || currentUser.role === "srm" || currentUser.role === "admin") &&
    canPerform(permit.state, "submit_stage4");
  const showStage4Override = showStage4Form && !isApplicant && currentUser.role !== "admin";

  const showEndorsementForm =
    isSrm && canPerform(permit.state, "endorse_day") && isMultiDay(permit);

  const editableBeforeAssessment =
    (isApplicant || currentUser.role === "srm" || currentUser.role === "admin") &&
    (permit.state === "draft" || permit.state === "pending_safety_assessment");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
        </CardHeader>

        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Vessel / Project" value={permit.vessel_project} />
          <Field label="Location of Work" value={permit.location_of_work} />
          <Field
            label="Hazard Types"
            value={permit.hazard_types
              .join(", ")
              .replace(/\b\w/g, (c) => c.toUpperCase())}
          />
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
                by: permit.applicant?.full_name ?? "—",
                role: permit.applicant?.department ?? "Applicant",
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
              <OverrideNotice role={currentUser.role} stage="I" />
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
                checklist?: Record<string, boolean>;
              }
            }
          />
        ) : showStage2Form ? (
          <>
            {showStage2Override ? (
              <OverrideNotice role={currentUser.role} stage="II" />
            ) : null}
            <Stage2Form permitId={permit.id} />
          </>
        ) : (
          <PendingNotice
            msg={
              permit.state === "draft"
                ? "Awaiting Stage I submission."
                : "Pending Safety Assessor condition verification."
            }
          />
        )}
      </StageCard>

      <StageCard
        title="Stage III — Approval by Ship-Repair Manager"
        meta={
          stage3
            ? {
                by: permit.srm?.full_name ?? "—",
                role: permit.srm?.department ?? "SRM",
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
                : "Pending SRM evaluation."
            }
          />
        )}
      </StageCard>

      {isMultiDay(permit) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Day 2–{permitDayRange(permit)} Endorsements</CardTitle>
              <Badge tone="info">Today is Day {currentPermitDay(permit)}</Badge>
            </div>
          </CardHeader>

          <CardBody className="space-y-3">
            <EndorsementGrid
              endorsements={endorsements}
              dayRange={permitDayRange(permit)}
            />

            {showEndorsementForm ? (
              <EndorsementForm
                permitId={permit.id}
                day={Math.max(2, currentPermitDay(permit))}
                maxDay={permitDayRange(permit)}
                existingDays={endorsements.map((e) => e.day_number)}
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
          <p className="text-sm text-slate-700">
            Permit closed and archived.
          </p>
        ) : showStage4Form ? (
          <>
            {showStage4Override ? (
              <OverrideNotice role={currentUser.role} stage="IV" />
            ) : null}
            <Stage4Form permitId={permit.id} />
          </>
        ) : (
          <PendingNotice msg="Close-out becomes available once the permit is approved/active." />
        )}
      </StageCard>
    </div>
  );
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
    checklist?: Record<string, boolean>;
  };
}) {
  const checklistItems = [
    ["isolation_checked", "Isolation checked"],
    ["barricade_installed", "Barricade installed"],
    ["gas_test_completed", "Gas test completed"],
    ["fire_watch_assigned", "Fire watch assigned"],
    ["ppe_verified", "PPE verified"],
    ["evidence_reviewed", "Evidence reviewed"],
  ] as const;

  return (
    <div className="space-y-3">
      <Badge tone={data.fit ? "ok" : "bad"}>
        {data.fit ? "Fit for Hot Work" : "Not Fit for Hot Work"}
      </Badge>

      {data.checklist ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Condition Verification Checklist
          </div>

          <ul className="space-y-1.5 text-sm">
            {checklistItems.map(([key, label]) => (
              <li key={key} className="flex items-start gap-2">
                <span
                  className={
                    data.checklist?.[key]
                      ? "h-5 w-5 rounded bg-emerald-600 text-white grid place-items-center text-xs"
                      : "h-5 w-5 rounded border border-slate-300 grid place-items-center"
                  }
                >
                  {data.checklist?.[key] ? "✓" : ""}
                </span>
                {label}
              </li>
            ))}
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
      ? "Acting as Ship-Repair Manager (override)"
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
}: {
  endorsements: PermitEndorsementRow[];
  dayRange: number;
}) {
  const days = Array.from(
    { length: Math.min(13, dayRange - 1) },
    (_, i) => i + 2,
  );

  const map = new Map(endorsements.map((e) => [e.day_number, e]));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {days.map((day) => {
        const endorsement = map.get(day);

        const tone =
          endorsement?.action === "continue"
            ? "ok"
            : endorsement?.action === "reject" ||
                endorsement?.action === "revoke"
              ? "bad"
              : "neutral";

        return (
          <div
            key={day}
            className={
              "rounded-md border p-3 text-center text-xs " +
              (endorsement
                ? tone === "ok"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200"
                : "bg-slate-50 border-slate-200 text-slate-400")
            }
          >
            <div className="font-semibold text-slate-700">Day {day}</div>

            {endorsement ? (
              <>
                <div className="capitalize mt-1">{endorsement.action}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {formatDate(endorsement.ts)}
                </div>
              </>
            ) : (
              <div className="mt-1">Pending</div>
            )}
          </div>
        );
      })}
    </div>
  );
}